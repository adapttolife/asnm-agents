import "dotenv/config";
import { applyPatch, candidates, sports } from "./database.js";
import { FILLABLE_FIELDS } from "./config.js";
import { scrapeWithBrowser } from "./browser.js";
import { crawlSite } from "./crawler.js";
import { fillMissing, GeminiPool, normalizePatch } from "./gemini.js";
import { geocodeAddress } from "./geocode.js";
import { deterministicPatch, missingFields } from "./normalize.js";
import { OpenWebSearch, searchQuery } from "./web-search.js";

function options(argv) {
  const value = (name, fallback = "") => {
    const index = argv.indexOf(name);
    return (index >= 0) ? (argv[index + 1] || fallback) : fallback;
  };
  return {
    apply: argv.includes("--apply"),
    id: value("--id"),
    limit: Math.max(1, Math.min(Number(value("--limit", "10")) || 10, 2500)),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function emptyOnly(patch, row) {
  return Object.fromEntries(Object.entries(patch).filter(([field, value]) => FILLABLE_FIELDS.includes(field) && (value !== null) && (value !== undefined) && (value !== "") && ((row[field] === null) || (row[field] === ""))));
}

async function browserFallback(url) {
  try {
    return await scrapeWithBrowser(url);
  } catch (error) {
    return { pages: [], error: error.message };
  }
}

async function searchForSite(row, search) {
  const results = await search.search(searchQuery(row));
  for (const result of results) {
    try {
      return await crawlSite(result.url);
    } catch {
      const browser = await browserFallback(result.url);
      if (browser.pages.length) return browser;
    }
  }
  return { pages: [] };
}

async function collectSite(row, search) {
  if (row.website_url) {
    try {
      return await crawlSite(row.website_url);
    } catch {
      const browser = await browserFallback(row.website_url);
      if (browser.pages.length) return browser;
    }
  }
  return searchForSite(row, search);
}

function usage() {
  console.log("Usage: node index.js [--limit 10] [--id organization-id] [--apply]");
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) return usage();
  const [sportRows, rows] = await Promise.all([sports(), candidates(args.limit, args.id)]);
  const search = new OpenWebSearch();
  const pool = new GeminiPool();
  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    candidates: rows.length,
    researched: 0,
    changed: 0,
    skipped: 0,
    failed: 0
  };
  try {
    await search.start();
    for (const row of rows) {
      try {
        const deterministic = deterministicPatch(row, sportRows);
        const effective = { ...row, ...deterministic };
        const missing = FILLABLE_FIELDS.filter((field) => missingFields(effective).includes(field));
        let patch = { ...deterministic };
        if (missing.length) {
          const site = await collectSite(effective, search);
          if (site.pages.length) {
            summary.researched++;
            const found = await fillMissing(pool, effective, missing, sportRows, site.pages);
            patch = {
              ...patch,
              ...normalizePatch(found, sportRows)
            };
            if (!effective.website_url && site.websiteUrl) patch.website_url ||= site.websiteUrl;
          }
        }
        if (patch.address && (!row.lat || !row.lng)) patch = {
          ...patch,
          ...await geocodeAddress({ ...effective, ...patch })
        
        };
        patch = emptyOnly(patch, row);
        if (!Object.keys(patch).length) {
          summary.skipped++;
          continue;
        }
        console.log(JSON.stringify({
          id: row.id,
          name: row.name, patch
        }));
        if (args.apply) await applyPatch(row.id, patch);
        summary.changed++;
      } catch (error) {
        summary.failed++;
        console.error(JSON.stringify({
          id: row.id,
          name: row.name,
          error: error.message
        }));
      }
    }
  } finally {
    await search.close();
  }
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});