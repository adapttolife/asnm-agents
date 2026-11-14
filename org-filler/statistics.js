import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function runId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function createStatistics({ mode, environment, directory = join(process.cwd(), "statistics") }) {
  await mkdir(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const file = join(directory, `org-filler-${runId(new Date())}-${process.pid}.json`);
  const statistics = {
    mode,
    environment,
    startedAt,
    updatedAt: startedAt,
    changed: 0,
    skipped: 0,
    failed: 0,
    changedOrganizations: []
  };

  const save = async () => {
    statistics.updatedAt = new Date().toISOString();
    await writeFile(file, `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
  };

  await save();
  return {
    file,
    changed: async (organization) => {
      statistics.changed++;
      statistics.changedOrganizations.push(organization);
      await save();
    },
    skipped: async () => {
      statistics.skipped++;
      await save();
    },
    failed: async () => {
      statistics.failed++;
      await save();
    },
    snapshot: () => ({ ...statistics, changedOrganizations: [...statistics.changedOrganizations] })
  };
}
