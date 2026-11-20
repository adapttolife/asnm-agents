import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createStatistics({ mode, environment, directory = join(process.cwd(), "statistics") }) {
  await mkdir(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const file = join(directory, `program-scraper-${startedAt.replace(/[:.]/g, "-")}-${process.pid}.json`);
  const statistics = { mode, environment, startedAt, updatedAt: startedAt, pairsCompleted: 0, pairsSkipped: 0, organizationProgramRuns: 0, organizationProgramSkips: 0, candidatesFound: 0, programsQueued: 0, failed: 0, processedPairs: [], processing: null };
  const save = async () => {
    statistics.updatedAt = new Date().toISOString();
    await writeFile(file, `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
  };
  await save();
  const complete = async (field, pair, candidates = 0) => {
    statistics[field]++;
    statistics.candidatesFound += candidates;
    if (field === "pairsCompleted") {
      statistics.programsQueued += candidates;
      statistics.processedPairs.push(pair);
    }
    statistics.processing = null;
    await save();
  };
  return {
    file,
    started: async (pair) => {
      statistics.processing = { ...pair, startedAt: new Date().toISOString() };
      await save();
    },
    completed: (pair, candidates) => complete("pairsCompleted", pair, candidates),
    skipped: () => complete("pairsSkipped", null),
    organizationProgramStarted: async (organization) => {
      statistics.processing = {
        type: "organization_program_discovery",
        organizationId: organization.id,
        organizationName: organization.name,
        startedAt: new Date().toISOString(),
      };
      await save();
    },
    organizationProgramCompleted: async (organization, count) => {
      statistics.organizationProgramRuns++;
      statistics.programsQueued += count;
      statistics.candidatesFound += count;
      statistics.processedPairs.push({
        type: "organization_program_discovery",
        organizationId: organization.id,
        organizationName: organization.name,
        programsQueued: count,
      });
      statistics.processing = null;
      await save();
    },
    organizationProgramSkipped: async () => {
      statistics.organizationProgramSkips++;
      statistics.processing = null;
      await save();
    },
    failed: async () => { statistics.failed++; statistics.processing = null; await save(); }
  };
}
