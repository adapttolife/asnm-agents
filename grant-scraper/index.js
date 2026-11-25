import { randomUUID } from "node:crypto";
import { loadAreas, pickArea } from "./areas.js";
import { AREA_REFRESH_DAYS, DISCOVERY_RESULT_LIMIT, IS_PRODUCTION, MAX_PAIR_ATTEMPTS, PAIR_LOCK_MS, RUN_INTERVAL_MS } from "./config.js";
import { claimAreaPair, insertGrant, releaseAreaPair, sports, unlockAreaPair } from "./database.js";
import { areaSearchQuery, newGrants } from "./discovery.js";
import { createLogger } from "./logger.js";
import { createStatistics } from "./statistics.js";
import { OpenWebSearch } from "./web-search.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function options(argv) {
  return {
    once: argv.includes("--once"),
    apply: argv.includes("--apply"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function usage() {
  console.log("Usage: node index.js [--prod] [--once] [--apply]");
}

async function findAreaJob(areas, sportRows, apply) {
  if (!sportRows.length) throw new Error("No sports are available in D1.");

  for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS; attempt++) {
    const pair = pickArea(areas);
    const sport = sportRows[Math.floor(Math.random() * sportRows.length)];
    const token = randomUUID();
    if (!apply) return { pair, sport, token, locked: false };

    const claimed = await claimAreaPair(pair, sport.sport_key, token, AREA_REFRESH_DAYS[pair.kind], PAIR_LOCK_MS);
    if (claimed.length) return { pair, sport, token, locked: true };
  }

  return null;
}

async function runAreaDiscovery({ areas, sportRows, search, logger, statistics, apply }) {
  const job = await findAreaJob(areas, sportRows, apply);
  if (!job) {
    await statistics.skipped();
    await logger.info("No due sport-area pair was available for grant discovery.");
    return;
  }

  const { pair, sport, token, locked } = job;
  const target = {
    areaKind: pair.kind,
    areaId: pair.id,
    area: pair.name,
    state: pair.state || null,
    sport: sport.name,
    sportKey: sport.sport_key,
  };
  await statistics.started(target);
  await logger.info(`Searching adaptive-sports grants for ${sport.name} in ${pair.name}${pair.state ? `, ${pair.state}` : ""}.`);

  try {
    await search.start();
    const results = await search.search(areaSearchQuery(sport, pair), DISCOVERY_RESULT_LIMIT);
    const grants = newGrants(results);
    await logger.info(`${sport.name} / ${pair.name}: ${results.length} results, ${grants.length} grant candidates.`);

    if (apply) {
      for (const grant of grants) await insertGrant(grant);
      await releaseAreaPair(pair, sport.sport_key, token);
    }

    await statistics.completed(target, grants.length);
    await logger.info(`${pair.name}: ${apply ? "queued" : "would queue"} ${grants.length} private grant candidates.`);
  } catch (error) {
    if (locked) await unlockAreaPair(pair, sport.sport_key, token);
    throw error;
  }
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) return usage();

  const logger = await createLogger();
  const statistics = await createStatistics({
    mode: args.apply ? "apply" : "dry-run",
    environment: IS_PRODUCTION ? "production" : "staging",
  });
  const areas = await loadAreas();
  const sportRows = await sports();
  const search = new OpenWebSearch();
  await logger.info(`Grant scraper started for ${IS_PRODUCTION ? "production" : "staging"}${args.apply ? " in apply mode" : " in dry-run mode"}.`);
  await logger.info(`Statistics file: ${statistics.file}`);

  try {
    do {
      try {
        await runAreaDiscovery({ areas, sportRows, search, logger, statistics, apply: args.apply });
      } catch (error) {
        await statistics.failed();
        await logger.error(error.stack || error.message);
      }

      if (args.once) break;
      await logger.info(`Waiting ${Math.round(RUN_INTERVAL_MS / 60_000)} minutes before the next discovery pass.`);
      await wait(RUN_INTERVAL_MS);
    } while (true);
  } finally {
    await search.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
