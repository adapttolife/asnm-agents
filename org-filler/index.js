import "dotenv/config";
import { applyPatch, candidates, sports } from "./database.js";
import { FILLABLE_FIELDS } from "./config.js";
import { batchOrganizations, configuredKeyCount, normalizeResearch, researchOrganizations } from "./gemini.js";
import { geocodeAddress } from "./geocode.js";
import { searchOrganizations } from "./searlo.js";
import { deterministicFields } from "./normalize.js";

function options(argv) {
  const value = (name, fallback = "") => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] || fallback : fallback;
  };
  return {
    apply: argv.includes("--apply"),
    help: argv.includes("--help") || argv.includes("-h"),
    id: value("--id"),
    limit: Math.max(1, Math.min(Number(value("--limit", "10")) || 10, 2_500)),
    model: value("--model") || undefined,
    concurrency: Math.max(1, Math.min(Number(value("--concurrency", String(configuredKeyCount() || 1))) || 1, configuredKeyCount() || 1)),
  };
}

function missingFields(row) {
  return FILLABLE_FIELDS.filter((field) => row[field] === null || row[field] === "");
}

function emptyOnly(patch, row) {
  return Object.fromEntries(Object.entries(patch).filter(([field, value]) =>
    FILLABLE_FIELDS.includes(field) && value !== null && value !== undefined && value !== "" && (row[field] === null || row[field] === "")
  ));
}

function usage() {
  console.log("Usage: node index.js [--limit 2200] [--id organization-id] [--model gemini-3.5-flash-lite] [--concurrency 6] [--apply]");
}

async function savePatch(row, patch, args) {
  if (patch.address && (row.lat === null || row.lng === null)) patch = { ...patch, ...await geocodeAddress({ ...row, ...patch }) };
  patch = emptyOnly(patch, row);
  if (!Object.keys(patch).length) return false;
  console.log(JSON.stringify({ id: row.id, name: row.name, patch }));
  if (args.apply) await applyPatch(row.id, patch);
  return true;
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) return usage();
  const sportRows = await sports();
  const rows = await candidates(args.limit, args.id);
  const jobs = rows.map((row) => ({ row, patch: deterministicFields(row, sportRows) }));
  const researchJobs = jobs.filter(({ row, patch }) => missingFields({ ...row, ...patch }).some((field) => field !== "sport_key" && field !== "state_name"));
  const sourcesById = await searchOrganizations(researchJobs.map(({ row }) => row));
  const researchRows = researchJobs.map(({ row }) => ({ ...row, sources: sourcesById.get(row.id) || [] }));
  const batches = batchOrganizations(researchRows, sportRows);
  let changed = 0;
  for (const { row, patch } of jobs.filter((job) => !researchJobs.includes(job))) if (await savePatch(row, patch, args)) changed++;
  let nextBatch = 0;
  const worker = async () => {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch++];
      const researched = await researchOrganizations(batch, sportRows, args.model);
      for (const row of batch) {
        const job = researchJobs.find((candidate) => candidate.row.id === row.id);
        const patch = { ...job.patch, ...normalizeResearch(researched.get(row.id) || {}, sportRows) };
        if (await savePatch(row, patch, args)) changed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(args.concurrency, batches.length) }, worker));
  console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", candidates: rows.length, researchBatches: batches.length, changed, concurrency: args.concurrency }));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
