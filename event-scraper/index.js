import { randomUUID } from "node:crypto";
import { loadAreas, pickArea } from "./areas.js";
import { AREA_REFRESH_DAYS, EVENT_ENTITY_REFRESH_DAYS, IS_PRODUCTION, MAX_PAIR_ATTEMPTS, PAIR_LOCK_MS, RUN_INTERVAL_MS } from "./config.js";
import { claimAreaPair, claimEntityTarget, dueEntityTargets, existingEventsForArea, existingEventsForTarget, insertEvent, releaseAreaPair, releaseEntityTarget, sports, unlockAreaPair, unlockEntityTarget } from "./database.js";
import { areaSearchQuery, entitySearchQuery, newAreaEvents, newEntityEvents } from "./discovery.js";
import { createLogger } from "./logger.js";
import { createStatistics } from "./statistics.js";
import { OpenWebSearch } from "./web-search.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function options(argv) {
  return {
    once: argv.includes("--once"),
    dryRun: argv.includes("--dry-run"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function usage() {
  console.log("Usage: node index.js [--prod] [--once] [--dry-run]");
}

async function findAreaJob(areas, sportRows, dryRun) {
  for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS; attempt++) {
    const pair = pickArea(areas);
    const sport = sportRows[Math.floor(Math.random() * sportRows.length)];
    const token = randomUUID();
    if (dryRun) return { pair, sport, token, locked: false };

    const claimed = await claimAreaPair(
      pair,
      sport.sport_key,
      token,
      AREA_REFRESH_DAYS[pair.kind],
      PAIR_LOCK_MS,
    );
    if (claimed.length) return { pair, sport, token, locked: true };
  }

  return null;
}

async function runAreaDiscovery({ areas, search, logger, statistics, dryRun }) {
  const sportRows = await sports();
  const job = await findAreaJob(areas, sportRows, dryRun);
  if (!job) {
    await statistics.areaSkipped();
    await logger.info("No due sport-area pair was available for event discovery.");
    return;
  }

  const { pair, sport, token, locked } = job;
  const area = {
    areaKind: pair.kind,
    areaId: pair.id,
    area: pair.name,
    state: pair.state || null,
    sport: sport.name,
    sportKey: sport.sport_key,
  };
  await statistics.areaStarted(area);
  await logger.info(`Searching events for ${sport.name} in ${pair.name}${pair.state ? `, ${pair.state}` : ""}.`);

  try {
    const existing = await existingEventsForArea(pair, sport.sport_key);
    await search.start();
    const results = await search.search(areaSearchQuery(sport, pair));
    const candidates = newAreaEvents(results, existing);
    await logger.info(`${sport.name} / ${pair.name}: ${results.length} results, ${candidates.length} dated event candidates.`);

    if (!dryRun) {
      for (const candidate of candidates) {
        await insertEvent(candidate, {
          sport_key: sport.sport_key,
          city: pair.city,
          state: pair.state,
        });
      }
      await releaseAreaPair(pair, sport.sport_key, token);
    }

    await statistics.areaCompleted(area, candidates.length);
    await logger.info(`${pair.name}: ${dryRun ? "would queue" : "queued"} ${candidates.length} events.`);
  } catch (error) {
    if (locked) await unlockAreaPair(pair, sport.sport_key, token);
    throw error;
  }
}

async function runEntityDiscovery({ search, logger, statistics, dryRun }) {
  const targets = await dueEntityTargets(EVENT_ENTITY_REFRESH_DAYS);
  let job = null;

  for (const target of targets) {
    const token = randomUUID();
    if (dryRun) {
      job = { target, token, locked: false };
      break;
    }

    const claimed = await claimEntityTarget(
      target.entity_type,
      target.entity_id,
      token,
      PAIR_LOCK_MS,
      EVENT_ENTITY_REFRESH_DAYS,
    );
    if (claimed.length) {
      job = { target, token, locked: true };
      break;
    }
  }

  if (!job) {
    await statistics.entitySkipped();
    await logger.info("No due organization or program was available for event discovery.");
    return;
  }

  const { target, token, locked } = job;
  await statistics.entityStarted(target);
  await logger.info(`Searching events for ${target.entity_type} ${target.entity_name} (${target.entity_id}).`);

  try {
    const existing = await existingEventsForTarget(target);
    await search.start();
    const results = await search.search(entitySearchQuery(target));
    const candidates = newEntityEvents(results, existing, target);
    await logger.info(`${target.entity_name}: ${results.length} results, ${candidates.length} dated event candidates.`);

    if (!dryRun) {
      for (const candidate of candidates) {
        await insertEvent(candidate, {
          sport_key: target.sport_key,
          city: target.city,
          state: target.state,
          org_id: target.org_id,
          program_id: target.program_id,
        });
      }
      await releaseEntityTarget(target.entity_type, target.entity_id, token);
    }

    await statistics.entityCompleted(target, candidates.length);
    await logger.info(`${target.entity_name}: ${dryRun ? "would queue" : "queued"} ${candidates.length} linked events.`);
  } catch (error) {
    if (locked) await unlockEntityTarget(target.entity_type, target.entity_id, token);
    throw error;
  }
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) return usage();

  const logger = await createLogger();
  const statistics = await createStatistics({
    mode: args.dryRun ? "dry-run" : "apply",
    environment: IS_PRODUCTION ? "production" : "staging",
  });
  const areas = await loadAreas();
  const search = new OpenWebSearch();
  await logger.info(`Event scraper started for ${IS_PRODUCTION ? "production" : "staging"}${args.dryRun ? " in dry-run mode" : ""}.`);
  await logger.info(`Statistics file: ${statistics.file}`);

  try {
    do {
      try {
        await runAreaDiscovery({ areas, search, logger, statistics, dryRun: args.dryRun });
      } catch (error) {
        await statistics.failed();
        await logger.error(error.stack || error.message);
      }

      try {
        await runEntityDiscovery({ search, logger, statistics, dryRun: args.dryRun });
      } catch (error) {
        await statistics.failed();
        await logger.error(error.stack || error.message);
      }

      if (args.once || args.dryRun) break;
      await logger.info(`Waiting ${Math.round(RUN_INTERVAL_MS / 60_000)} minutes before the next discovery cycle.`);
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
