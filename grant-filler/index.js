import { applyPatch, candidates, sports } from "./database.js";
import { DATABASE_NAME, ENVIRONMENT_FILE, FILLABLE_FIELDS, IS_PRODUCTION, RUN_INTERVAL_MS, WRANGLER_CONFIG } from "./config.js";
import { scrapeWithBrowser } from "./browser.js";
import { crawlSite } from "./crawler.js";
import { fillMissing, GeminiPool, normalizePatch } from "./gemini.js";
import { createLogger, formatDuration } from "./logger.js";
import { missingFields } from "./normalize.js";
import { createStatistics } from "./statistics.js";
import { OpenWebSearch, searchQuery } from "./web-search.js";

function options(argv) {
  const value = (name, fallback = "") => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] || fallback : fallback;
  };
  return {
    apply: argv.includes("--apply"),
    id: value("--id"),
    limit: Number(value("--limit", "10")) === 0
      ? Infinity
      : Math.max(1, Math.min(Number(value("--limit", "10")) || 10, 2500)),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function emptyOnly(patch, row) {
  return Object.fromEntries(Object.entries(patch).filter(([field, value]) =>
    FILLABLE_FIELDS.includes(field) &&
    value !== null &&
    value !== undefined &&
    value !== "" &&
    missingFields({ [field]: row[field] }).includes(field),
  ));
}

function elapsed(startedAt) {
  return formatDuration(performance.now() - startedAt);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function crawl(url, report) {
  try {
    await report(`crawler starting: ${url}`);
    const site = await crawlSite(url, { onProgress: report });
    await report(`crawler finished (${site.pages.length} pages)`);
    return site;
  } catch (error) {
    await report(`crawler failed: ${error.message}`);
    try {
      await report("browser fallback starting");
      const site = await scrapeWithBrowser(url);
      await report(`browser fallback finished (${site.pages.length} pages)`);
      return site;
    } catch (browserError) {
      await report(`browser fallback failed: ${browserError.message}`);
      return { pages: [] };
    }
  }
}

async function collectPages(grant, search, report) {
  for (const url of [grant.source_url, grant.application_url].filter(Boolean)) {
    const site = await crawl(url, report);
    if (site.pages.length) return site.pages;
  }

  await report("open-websearch starting");
  await search.start();
  const results = await search.search(searchQuery(grant));
  await report(`open-websearch returned ${results.length} results`);
  for (const result of results) {
    const site = await crawl(result.url, report);
    if (site.pages.length) return site.pages;
  }
  return [];
}

function usage() {
  console.log("Usage: node index.js [--prod] [--limit 10] [--id grant-id] [--apply]");
}

async function runPass(args, logger, statistics, pool) {
  const startedAt = performance.now();
  const [sportRows, rows] = await Promise.all([sports(), candidates(args.limit, args.id)]);
  await logger.info(`Grant rows with empty supported fields: ${rows.length}/${args.limit}`);
  const search = new OpenWebSearch();
  const summary = { mode: args.apply ? "apply" : "dry-run", candidates: rows.length, researched: 0, changed: 0, skipped: 0, failed: 0 };

  try {
    for (const grant of rows) {
      const rowStartedAt = performance.now();
      try {
        await statistics.started(grant);
        const report = async (message) => {
          await logger.info(`${grant.name}: ${message}`);
          await statistics.activity(message);
        };
        await report("processing started");
        const missing = FILLABLE_FIELDS.filter((field) => missingFields({ [field]: grant[field] }).includes(field));
        const pages = await collectPages(grant, search, report);
        let patch = {};
        if (pages.length && missing.length) {
          summary.researched++;
          const geminiStartedAt = performance.now();
          const found = await fillMissing(pool, grant, missing, sportRows, pages);
          await logger.info(`${grant.name}: Gemini used in ${elapsed(geminiStartedAt)} for ${missing.length} empty fields across ${pages.length} source pages.`);
          patch = normalizePatch(found, sportRows, grant);
        }

        patch = emptyOnly(patch, grant);
        if (!Object.keys(patch).length) {
          summary.skipped++;
          await statistics.skipped();
          await logger.info(`${grant.name}: no supported empty fields could be filled. Completed in ${elapsed(rowStartedAt)}.`);
          continue;
        }

        await logger.info(JSON.stringify({ id: grant.id, name: grant.name, patch }));
        if (args.apply) await applyPatch(grant.id, patch);
        summary.changed++;
        await statistics.changed(grant.name);
        await logger.info(`${grant.name}: ${args.apply ? "applied" : "proposed"} patch completed in ${elapsed(rowStartedAt)}.`);
      } catch (error) {
        summary.failed++;
        await statistics.failed();
        await logger.error(JSON.stringify({ id: grant.id, name: grant.name, error: error.message }));
        await logger.error(`${grant.name}: failed after ${elapsed(rowStartedAt)}.`);
      }
    }
  } finally {
    await search.close();
  }

  await logger.info(`${JSON.stringify(summary)} Total runtime: ${elapsed(startedAt)}.`);
  return summary;
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) return usage();
  const logger = await createLogger();
  const statistics = await createStatistics({
    mode: args.apply ? "apply" : "dry-run",
    environment: IS_PRODUCTION ? "production" : "staging",
  });
  const repeat = args.apply && !args.id;
  const pool = new GeminiPool();
  await logger.info(`Grant filler started in ${args.apply ? "apply" : "dry-run"} mode for ${IS_PRODUCTION ? "production" : "staging"} (${DATABASE_NAME}, ${WRANGLER_CONFIG}, ${ENVIRONMENT_FILE}). Log file: ${logger.file}`);
  await logger.info(`Statistics file: ${statistics.file}`);
  if (repeat) await logger.info(`Apply passes repeat every ${formatDuration(RUN_INTERVAL_MS)}. Use --id or omit --apply for a one-shot run.`);

  do {
    await runPass(args, logger, statistics, pool);
    if (!repeat) break;
    await logger.info(`Pass complete. Waiting ${formatDuration(RUN_INTERVAL_MS)} before the next pass.`);
    await wait(RUN_INTERVAL_MS);
  } while (repeat);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
