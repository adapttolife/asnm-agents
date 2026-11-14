import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { DATABASE_NAME, FILLABLE_FIELDS } from "./config.js";

const execFile = promisify(execFileCallback);
const empty = (column) => `NULLIF(TRIM(COALESCE(${column}, '')), '') IS NULL`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

function parseWranglerJson(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`Wrangler did not return JSON: ${stdout}`);
  const payload = JSON.parse(stdout.slice(start));
  if (!payload[0]?.success) throw new Error(JSON.stringify(payload));
  return payload[0].results || [];
}

async function execute(sql) {
  if ((DATABASE_NAME !== "asnm-db-staging") && (process.env.NODE_ENV !== "production")) throw new Error("org-filler is restricted to asnm-db-staging");
  try {
    const { stdout, stderr } = await execFile("npx", ["wrangler", "d1", "execute", DATABASE_NAME, "--remote", "--json", "--command", sql], { maxBuffer: 16 * 1024 * 1024 });
    if (stderr && !stdout) throw new Error(stderr);
    return parseWranglerJson(stdout);
  } catch (error) {
    throw new Error([error.message, error.stdout, error.stderr].filter(Boolean).join("\n"), { cause: error });
  }
}

export async function sports() {
  return execute("SELECT sport_key, name FROM sports ORDER BY name COLLATE NOCASE");
}

export async function candidates(limit, id = "") {
  return execute(`SELECT id, name, sport, sport_key, website_url, email, phone, city, state, state_name, zip, address, lat, lng, geo_precision, description FROM organizations WHERE verification_status = 'verified' AND status = 'active' ${id ? `AND id = ${quote(id)}` : ""} AND (${FILLABLE_FIELDS.map((field) => ["lat", "lng"].includes(field) ? `${field} IS NULL` : empty(field)).join(" OR ")}) ORDER BY updated_at ASC, name COLLATE NOCASE LIMIT ${Math.max(1, Number(limit) || 1)}`);
}

export async function applyPatch(id, patch) {
  const entries = Object.entries(patch).filter(([field, value]) => FILLABLE_FIELDS.includes(field) && (value !== null) && (value !== undefined) && (value !== ""));
  if (!entries.length) return false;
  await execute(`UPDATE organizations SET ${entries.map(([field, value]) => ["lat", "lng"].includes(field) ? `${field} = COALESCE(${field}, ${Number(value)})` : `${field} = COALESCE(NULLIF(TRIM(${field}), ''), ${quote(value)})`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ${quote(id)} AND verification_status = 'verified' AND status = 'active' AND (${entries.map(([field]) => ["lat", "lng"].includes(field) ? `${field} IS NULL` : empty(field)).join(" OR ")})`);
  return true;
}