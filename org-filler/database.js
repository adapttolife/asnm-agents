import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { DATABASE_NAME, FILLABLE_FIELDS } from "./config.js";

const exec = promisify(execCallback);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const nonempty = (column, value) => `COALESCE(NULLIF(TRIM(${column}), ''), ${quote(value)})`;

function shellQuote(value) {
  const text = String(value);
  if (process.platform === "win32") return `"${text.replaceAll("\"", "\\\"")}"`;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function parseJson(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`Wrangler did not return JSON: ${stdout}`);
  return JSON.parse(stdout.slice(start));
}

async function execute(sql) {
  if (DATABASE_NAME !== "asnm-db-staging") throw new Error("org-filler can only target asnm-db-staging");
  const command = `npx wrangler d1 execute ${DATABASE_NAME} --remote --json --command ${shellQuote(sql)}`;
  let stdout;
  let stderr;
  try {
    ({ stdout, stderr } = await exec(command, { maxBuffer: 8 * 1024 * 1024 }));
  } catch (error) {
    throw new Error([error.message, error.stdout, error.stderr].filter(Boolean).join("`n"), { cause: error });
  }
  if (stderr && !stdout) throw new Error(stderr);
  const payload = parseJson(stdout);
  if (!payload[0]?.success) throw new Error(JSON.stringify(payload));
  return payload[0].results || [];
}

export async function sports() {
  return execute("SELECT sport_key, name FROM sports ORDER BY name COLLATE NOCASE");
}

export async function candidates(limit, id = "") {
  const where = id ? `id = ${quote(id)}` : `(${FILLABLE_FIELDS.map((field) => ((field === "lat") || (field === "lng")) ? `${field} IS NULL` : `NULLIF(TRIM(COALESCE(${field}, '')), '') IS NULL`).join(" OR ")})`;
  return execute(`SELECT id, name, sport, sport_key, website_url, email, phone, city, state, state_name, zip, address, lat, lng, geo_precision, description FROM organizations WHERE ${where} ORDER BY updated_at ASC, name COLLATE NOCASE LIMIT ${Number(limit)}`);
}

export async function applyPatch(id, patch) {
  const entries = Object.entries(patch).filter(([field, value]) => FILLABLE_FIELDS.includes(field) && (value !== null) && (value !== undefined) && (value !== ""));
  if (!entries.length) return false;
  const sets = entries.map(([field, value]) => {
    if ((field === "lat") || (field === "lng")) return `${field} = COALESCE(${field}, ${Number(value)})`;
    return `${field} = ${nonempty(field, value)}`;
  });
  await execute(`UPDATE organizations SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ${quote(id)}`);
  return true;
}