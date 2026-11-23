import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createStatistics({ mode, environment, directory = join(process.cwd(), "statistics") }) {
  await mkdir(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const file = join(directory, `event-scraper-${startedAt.replace(/[:.]/g, "-")}-${process.pid}.json`);
  const statistics = {
    mode,
    environment,
    startedAt,
    updatedAt: startedAt,
    areaPairsCompleted: 0,
    areaPairsSkipped: 0,
    entityDiscoveryRuns: 0,
    entityDiscoverySkips: 0,
    candidatesFound: 0,
    eventsQueued: 0,
    failed: 0,
    processedTargets: [],
    processing: null,
  };

  const save = async () => {
    statistics.updatedAt = new Date().toISOString();
    await writeFile(file, `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
  };
  const completed = async (counter, target, count) => {
    statistics[counter]++;
    statistics.candidatesFound += count;
    statistics.eventsQueued += count;
    statistics.processedTargets.push({ ...target, eventsQueued: count });
    statistics.processing = null;
    await save();
  };

  await save();
  return {
    file,
    areaStarted: async (target) => {
      statistics.processing = { type: "sport_area", ...target, startedAt: new Date().toISOString() };
      await save();
    },
    areaCompleted: (target, count) => completed("areaPairsCompleted", target, count),
    areaSkipped: async () => {
      statistics.areaPairsSkipped++;
      statistics.processing = null;
      await save();
    },
    entityStarted: async (target) => {
      statistics.processing = {
        type: target.entity_type,
        entityId: target.entity_id,
        entityName: target.entity_name,
        startedAt: new Date().toISOString(),
      };
      await save();
    },
    entityCompleted: async (target, count) => {
      await completed("entityDiscoveryRuns", {
        type: target.entity_type,
        entityId: target.entity_id,
        entityName: target.entity_name,
      }, count);
    },
    entitySkipped: async () => {
      statistics.entityDiscoverySkips++;
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
