import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function runId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function createStatistics({ mode, environment, directory = join(process.cwd(), "statistics") }) {
  await mkdir(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const file = join(directory, `grant-filler-${runId(new Date())}-${process.pid}.json`);
  const statistics = {
    mode,
    environment,
    startedAt,
    updatedAt: startedAt,
    changed: 0,
    skipped: 0,
    failed: 0,
    changedGrants: [],
    processing: null
  };

  const save = async () => {
    statistics.updatedAt = new Date().toISOString();
    await writeFile(file, `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
  };

  await save();
  return {
    file,
    changed: async (grant) => {
      statistics.changed++;
      statistics.changedGrants.push(grant);
      statistics.processing = null;
      await save();
    },
    skipped: async () => {
      statistics.skipped++;
      statistics.processing = null;
      await save();
    },
    failed: async () => {
      statistics.failed++;
      statistics.processing = null;
      await save();
    },
    started: async (grant) => {
      statistics.processing = {
        id: grant.id,
        name: grant.name,
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        lastActivity: "processing started"
      };
      await save();
    },
    activity: async (message) => {
      if (!statistics.processing) return;
      statistics.processing.lastActivityAt = new Date().toISOString();
      statistics.processing.lastActivity = message;
      await save();
    },
    snapshot: () => ({ ...statistics, changedGrants: [...statistics.changedGrants] })
  };
}
