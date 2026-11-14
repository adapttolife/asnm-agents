import { applyPatch, candidates, sports } from "./database.js";
import { DATABASE_NAME, ENVIRONMENT_FILE, FILLABLE_FIELDS, IS_PRODUCTION, WRANGLER_CONFIG } from "./config.js";
import { scrapeWithBrowser } from "./browser.js";
import { crawlSite } from "./crawler.js";
import { fillMissing, GeminiPool, normalizePatch } from "./gemini.js";
import { geocodeAddress } from "./geocode.js";
import { createLogger, formatDuration } from "./logger.js";
import { deterministicPatch, missingFields } from "./normalize.js";
import { OpenWebSearch, searchQuery } from "./web-search.js";

function options(argv) {
  const value = (name, fallback = "") => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] || fallback : fallback;
  };
  return { apply: argv.includes("--apply"), id: value("--id"), limit: Math.max(1, Math.min(Number(value("--limit", "10")) || 10, 2500)), help: argv.includes("--help") || argv.includes("-h") };
}

function emptyOnly(patch, row) {
  return Object.fromEntries(Object.entries(patch).filter(([field, value]) => FILLABLE_FIELDS.includes(field) && value !== null && value !== undefined && value !== "" && (row[field] === null || row[field] === "")));
}

function elapsed(startedAt) {
  return formatDuration(performance.now() - startedAt);
}

async function browserFallback(url, details) {
  const startedAt = performance.now();
  try {
    const site = await scrapeWithBrowser(url);
    details.push(`browser used successfully in ${elapsed(startedAt)}`);
    return site;
  } catch (error) {
    details.push(`browser used but failed in ${elapsed(startedAt)} (${error.message})`);
    return { pages: [] };
  }
}

async function crawl(url, details, label) {
  const startedAt = performance.now();
  try {
    const site = await crawlSite(url);
    details.push(`crawler succeeded${label} in ${elapsed(startedAt)} (${site.pages.length} pages)`);
    return site;
  } catch (error) {
    details.push(`crawler failed${label} in ${elapsed(startedAt)} (${error.message})`);
    return null;
  }
}

async function searchForSite(row, search, details) {
  const startedAt = performance.now();
  await search.start();
  const results = await search.search(searchQuery(row));
  details.push(`open-websearch used in ${elapsed(startedAt)} (${results.length} results)`);
  for (const result of results) {
    const site = await crawl(result.url, details, " for a search result");
    if (site) {
      details.push("browser not used because the crawler succeeded");
      return site;
    }
    const browser = await browserFallback(result.url, details);
    if (browser.pages.length) return browser;
  }
  return { pages: [] };
}

async function collectSite(row, search) {
  const details = [];
  if (row.website_url) {
    const site = await crawl(row.website_url, details, " for the stored URL");
    if (site) {
      details.push("browser not used because the crawler succeeded");
      return { site, details };
    }
    const browser = await browserFallback(row.website_url, details);
    if (browser.pages.length) return { site: browser, details };
  } else {
    details.push("crawler not attempted because no website URL is stored");
    details.push("browser not used because no website URL is stored");
  }
  return { site: await searchForSite(row, search, details), details };
}

function usage() {
  console.log("Usage: node index.js [--prod] [--limit 10] [--id organization-id] [--apply]");
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) return usage();
  const startedAt = performance.now();
  const logger = await createLogger();
  await logger.info(`Organization filler started in ${args.apply ? "apply" : "dry-run"} mode for ${IS_PRODUCTION ? "production" : "staging"} (${DATABASE_NAME}, ${WRANGLER_CONFIG}, ${ENVIRONMENT_FILE}). Log file: ${logger.file}`);
  const [sportRows, rows] = await Promise.all([sports(), candidates(args.limit, args.id)]);
  await logger.info(`Rows that still need filling: ${rows.length}`);
  const search = new OpenWebSearch();
  const pool = new GeminiPool();
  const summary = { mode: args.apply ? "apply" : "dry-run", candidates: rows.length, researched: 0, changed: 0, skipped: 0, failed: 0 };
  try {
    for (const row of rows) {
      const rowStartedAt = performance.now();
      try {
        const deterministic = deterministicPatch(row, sportRows);
        const effective = { ...row, ...deterministic };
        const missing = FILLABLE_FIELDS.filter((field) => missingFields(effective).includes(field));
        let patch = { ...deterministic };
        if (missing.length) {
          const { site, details } = await collectSite(effective, search);
          await logger.info(`${row.name}: ${details.join("; ")}.`);
          if (site.pages.length) {
            summary.researched++;
            const geminiStartedAt = performance.now();
            const found = await fillMissing(pool, effective, missing, sportRows, site.pages);
            await logger.info(`${row.name}: Gemini used in ${elapsed(geminiStartedAt)} for ${missing.length} missing fields across ${site.pages.length} Markdown pages.`);
            patch = { ...patch, ...normalizePatch(found, sportRows) };
            if (!effective.website_url && site.websiteUrl) patch.website_url ||= site.websiteUrl;
          }
        }
        if (patch.address && (!row.lat || !row.lng)) {
          const geocodeStartedAt = performance.now();
          patch = { ...patch, ...await geocodeAddress({ ...effective, ...patch }) };
          await logger.info(`${row.name}: Census geocoder used in ${elapsed(geocodeStartedAt)}.`);
        }
        patch = emptyOnly(patch, row);
        if (!Object.keys(patch).length) {
          summary.skipped++;
          await logger.info(`${row.name}: no supported empty fields could be filled. Completed in ${elapsed(rowStartedAt)}.`);
          continue;
        }
        await logger.info(JSON.stringify({ id: row.id, name: row.name, patch }));
        if (args.apply) await applyPatch(row.id, patch);
        summary.changed++;
        await logger.info(`${row.name}: ${args.apply ? "applied" : "proposed"} patch completed in ${elapsed(rowStartedAt)}.`);
      } catch (error) {
        summary.failed++;
        await logger.error(JSON.stringify({ id: row.id, name: row.name, error: error.message }));
        await logger.error(`${row.name}: failed after ${elapsed(rowStartedAt)}.`);
      }
    }
  } finally {
    await search.close();
  }
  await logger.info(`${JSON.stringify(summary)} Total runtime: ${elapsed(startedAt)}.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
