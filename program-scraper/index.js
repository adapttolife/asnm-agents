import { randomUUID } from "node:crypto";
import { loadAreas, pickArea } from "./areas.js";
import { AREA_REFRESH_DAYS, IS_PRODUCTION, MAX_PAIR_ATTEMPTS, ORGANIZATION_PROGRAM_REFRESH_DAYS, PAIR_LOCK_MS, RUN_INTERVAL_MS } from "./config.js";
import { claimOrganizationProgramDiscovery, claimPair, dueOrganizationsForProgramDiscovery, existingPrograms, existingProgramsForOrganization, insertProgram, insertProgramForOrganization, releaseOrganizationProgramDiscovery, releasePair, sports, unlockOrganizationProgramDiscovery, unlockPair } from "./database.js";
import { newOrganizationPrograms, newPrograms, organizationProgramSearchQuery, searchQuery } from "./discovery.js";
import { createLogger } from "./logger.js";
import { createStatistics } from "./statistics.js";
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

async function runOnce({ areas, search, logger, statistics, dryRun }) {
  const sportRows = await sports();
  const job = await findJob(areas, sportRows, dryRun);
  if (!job) {
    await statistics.skipped();
    await logger.info("No unlocked, due sport-area pair was claimed after the configured attempts.");
    return;
  }
  const { pair, sport, token, locked } = job;
  const pairStatistic = { sport: sport.name, sportKey: sport.sport_key, areaKind: pair.kind, area: pair.name, state: pair.state || null };
  await statistics.started(pairStatistic);
  await logger.info(`Claimed ${sport.name} / ${pair.kind} / ${pair.name}${pair.state ? `, ${pair.state}` : ""}.`);
  try {
    const existing = await existingPrograms(pair, sport.sport_key);
    await search.start();
    const results = await search.search(searchQuery(sport, pair));
    const candidates = newPrograms(results, existing);
    await logger.info(`${sport.name} / ${pair.name}: ${existing.length} existing programs, ${results.length} search results, ${candidates.length} new candidates.`);
    if (!dryRun) for (const candidate of candidates) {
      await logger.info(`Inserting program: ${candidate.name} (${candidate.website_url || "no website"}) for sport ${sport.name} in area ${pair.kind} ${pair.name}`);
      await insertProgram(candidate, sport, pair);
    }
    if (!dryRun) await releasePair(pair, sport.sport_key, token);
    await statistics.completed(pairStatistic, candidates.length);
    await logger.info(`${sport.name} / ${pair.name}: ${dryRun ? "would add" : "added"} ${candidates.length} programs and released the pair.`);
  } catch (error) {
    if (locked) await unlockPair(pair, sport.sport_key, token);
    throw error;
  }
}

async function runOrganizationProgramDiscovery({ search, logger, statistics, dryRun }) {
  const organizations = await dueOrganizationsForProgramDiscovery(
    ORGANIZATION_PROGRAM_REFRESH_DAYS,
  );
  let job = null;

  for (const organization of organizations) {
    const token = randomUUID();
    if (dryRun) {
      job = { organization, token, locked: false };
      break;
    }

    const claimed = await claimOrganizationProgramDiscovery(
      organization.id,
      token,
      PAIR_LOCK_MS,
      ORGANIZATION_PROGRAM_REFRESH_DAYS,
    );
    if (claimed.length) {
      job = { organization, token, locked: true };
      break;
    }
  }

  if (!job) {
    await statistics.organizationProgramSkipped();
    await logger.info("No due organization was available for linked-program discovery.");
    return;
  }

  const { organization, token, locked } = job;
  await statistics.organizationProgramStarted(organization);
  await logger.info(`Searching programs for ${organization.name} (${organization.id}).`);

  try {
    const existing = await existingProgramsForOrganization(organization.id);
    await search.start();
    const results = await search.search(organizationProgramSearchQuery(organization));
    const candidates = newOrganizationPrograms(results, existing, organization);
    await logger.info(`${organization.name}: ${existing.length} existing linked programs, ${results.length} results, ${candidates.length} new programs.`);

    if (!dryRun) {
      for (const candidate of candidates) {
        await insertProgramForOrganization(candidate, organization);
      }
      await releaseOrganizationProgramDiscovery(organization.id, token);
    }

    await statistics.organizationProgramCompleted(organization, candidates.length);
    await logger.info(`${organization.name}: ${dryRun ? "would add" : "added"} ${candidates.length} linked programs.`);
  } catch (error) {
    if (locked) {
      await unlockOrganizationProgramDiscovery(organization.id, token);
    }
    throw error;
  }
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) return usage();
  const logger = await createLogger();
  const statistics = await createStatistics({ mode: args.dryRun ? "dry-run" : "apply", environment: IS_PRODUCTION ? "production" : "staging" });
  const areas = await loadAreas();
  const search = new OpenWebSearch();
  await logger.info(`Program scraper started for ${IS_PRODUCTION ? "production" : "staging"}${args.dryRun ? " in dry-run mode" : ""}.`);
  await logger.info(`Statistics file: ${statistics.file}`);
  try {
    do {
      try { await runOnce({ areas, search, logger, statistics, dryRun: args.dryRun }); }
      catch (error) { await statistics.failed(); await logger.error(error.stack || error.message); }
      try { await runOrganizationProgramDiscovery({ search, logger, statistics, dryRun: args.dryRun }); }
      catch (error) { await statistics.failed(); await logger.error(error.stack || error.message); }
      if (args.once || args.dryRun) break;
      await logger.info(`Waiting ${Math.round(RUN_INTERVAL_MS / 60_000)} minutes before the next pair.`);
      await wait(RUN_INTERVAL_MS);
    } while (true);
  } finally {
    await search.close();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
