import { randomUUID } from "node:crypto";
import { loadAreas, pickArea } from "./areas.js";
import { AREA_REFRESH_DAYS, IS_PRODUCTION, MAX_PAIR_ATTEMPTS, PAIR_LOCK_MS, RUN_INTERVAL_MS } from "./config.js";
import { claimPair, existingOrganizations, insertOrganization, releasePair, sports, unlockPair } from "./database.js";
import { newOrganizations, searchQuery } from "./discovery.js";
import { createLogger } from "./logger.js";
import { OpenWebSearch } from "./web-search.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const options = (argv) => ({
  once: argv.includes("--once"),
  dryRun: argv.includes("--dry-run"),
  help: argv.includes("--help") || argv.includes("-h")
});

function usage() {
  console.log("Usage: node index.js [--prod] [--once] [--dry-run]");
}

async function findJob(areas, sportRows, dryRun) {
  for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS; attempt++) {
    const pair = pickArea(areas);
    const sport = sportRows[Math.floor(Math.random() * sportRows.length)];
    const token = randomUUID();
    if (dryRun) return { pair, sport, token, locked: false };
    const claimed = await claimPair(pair, sport.sport_key, token, AREA_REFRESH_DAYS[pair.kind], PAIR_LOCK_MS);
    if (claimed.length) return { pair, sport, token, locked: true };
  }
  return null;
}

async function runOnce({ areas, search, logger, dryRun }) {
  const sportRows = await sports();
  const job = await findJob(areas, sportRows, dryRun);
  if (!job) {
    await logger.info("No unlocked, due sport-area pair was claimed after the configured attempts.");
    return;
  }
  const { pair, sport, token, locked } = job;
  await logger.info(`Claimed ${sport.name} / ${pair.kind} / ${pair.name}${pair.state ? `, ${pair.state}` : ""}.`);
  try {
    const existing = await existingOrganizations(pair);
    await search.start();
    const results = await search.search(searchQuery(sport, pair));
    const candidates = newOrganizations(results, existing);
    await logger.info(`${sport.name} / ${pair.name}: ${existing.length} existing organizations, ${results.length} search results, ${candidates.length} new candidates.`);
    if (!dryRun) for (const candidate of candidates) await insertOrganization(candidate);
    if (!dryRun) await releasePair(pair, sport.sport_key, token);
    await logger.info(`${sport.name} / ${pair.name}: ${dryRun ? "would add" : "added"} ${candidates.length} organizations and released the pair.`);
  } catch (error) {
    if (locked) await unlockPair(pair, sport.sport_key, token);
    throw error;
  }
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) return usage();
  const logger = await createLogger();
  const areas = await loadAreas();
  const search = new OpenWebSearch();
  await logger.info(`Organization scraper started for ${IS_PRODUCTION ? "production" : "staging"}${args.dryRun ? " in dry-run mode" : ""}.`);
  try {
    do {
      try { await runOnce({ areas, search, logger, dryRun: args.dryRun }); }
      catch (error) { await logger.error(error.stack || error.message); }
      if (args.once || args.dryRun) break;
      await logger.info(`Waiting ${Math.round(RUN_INTERVAL_MS / 60_000)} minutes before the next pair.`);
      await wait(RUN_INTERVAL_MS);
    } while (true);
  } finally {
    await search.close();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
