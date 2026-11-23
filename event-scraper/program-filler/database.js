import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { DATABASE_NAME, FILLABLE_FIELDS, IS_PRODUCTION, WRANGLER_CONFIG } from "./config.js";

const execFile = promisify(execFileCallback);
const empty = (column) => `NULLIF(TRIM(COALESCE(${column}, '')), '') IS NULL`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
export const FILL_ELIGIBILITY = "kind = 'program'";

function parseWranglerJson(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`Wrangler did not return JSON: ${stdout}`);
  const payload = JSON.parse(stdout.slice(start));
  if (!payload[0]?.success) throw new Error(JSON.stringify(payload));
  return payload[0].results || [];
}

async function execute(sql) {
  if (!IS_PRODUCTION && DATABASE_NAME !== "asnm-db-staging") throw new Error("Staging program-filler must target asnm-db-staging");
  if (IS_PRODUCTION && DATABASE_NAME !== "asnm-db") throw new Error("Production program-filler must target asnm-db");
  try {
    const { stdout, stderr } = await execFile("npx", ["wrangler", "d1", "execute", DATABASE_NAME, "--config", WRANGLER_CONFIG, "--remote", "--json", "--command", sql], { maxBuffer: 16 * 1024 * 1024 });
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
  return execute(`SELECT p.id, p.organization_id, p.name, p.slug, p.sport, p.sport_key, p.sports_json, p.website_url, p.email, p.phone, p.city, p.state, p.state_name, p.zip, p.country, p.address, p.lat, p.lng, p.geo_precision, p.description, p.cost_note, p.equipment_provided, p.ages, p.seasons_json, p.usual_month, p.first_year, o.name AS organization_name, o.website_url AS organization_website_url FROM programs p LEFT JOIN organizations o ON o.id = p.organization_id WHERE ${FILL_ELIGIBILITY.replaceAll("kind", "p.kind").replaceAll("status", "p.status")} ${id ? `AND p.id = ${quote(id)}` : ""} AND (${FILLABLE_FIELDS.map((field) => empty(`p.${field}`)).join(" OR ")}) ORDER BY p.updated_at ASC, p.name COLLATE NOCASE${limit === Infinity ? "" : ` LIMIT ${Math.max(1, Number(limit) || 1)}`}`);
}

export async function applyPatch(id, patch) {
  const numericFields = new Set(["lat", "lng", "equipment_provided", "usual_month", "first_year"]);
  const entries = Object.entries(patch).filter(([field, value]) => FILLABLE_FIELDS.includes(field) && (value !== null) && (value !== undefined) && (value !== "") && (!numericFields.has(field) || Number.isFinite(Number(value))));
  if (!entries.length) return false;
  await execute(`UPDATE programs SET ${entries.map(([field, value]) => numericFields.has(field) ? `${field} = COALESCE(NULLIF(TRIM(CAST(${field} AS TEXT)), ''), ${Number(value)})` : `${field} = COALESCE(NULLIF(TRIM(${field}), ''), ${quote(value)})`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ${quote(id)} AND ${FILL_ELIGIBILITY} AND (${entries.map(([field]) => empty(field)).join(" OR ")})`);
  return true;
}
