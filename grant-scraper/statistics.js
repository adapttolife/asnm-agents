import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createStatistics({ mode, environment, directory = join(process.cwd(), "statistics") }) {
  await mkdir(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const file = join(directory, `grant-scraper-${startedAt.replace(/[:.]/g, "-")}-${process.pid}.json`);
  const statistics = {
    mode,
    environment,
    startedAt,
    updatedAt: startedAt,
    areaPairsCompleted: 0,
    areaPairsSkipped: 0,
    candidatesFound: 0,
    grantsQueued: 0,
    failed: 0,
    processedAreas: [],
    processing: null,
  };

  const save = async () => {
    statistics.updatedAt = new Date().toISOString();
    await writeFile(file, `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
  };

  await save();
  return {
    file,
    started: async (target) => {
      statistics.processing = { ...target, startedAt: new Date().toISOString() };
      await save();
    },
    completed: async (target, count) => {
      statistics.areaPairsCompleted++;
      statistics.candidatesFound += count;
      statistics.grantsQueued += count;
      statistics.processedAreas.push({ ...target, grantsQueued: count });
      statistics.processing = null;
      await save();
    },
    skipped: async () => {
      statistics.areaPairsSkipped++;
      statistics.processing = null;
      await save();
    },
    failed: async () => {
      statistics.failed++;
      statistics.processing = null;
      await save();
    },
  };
}
