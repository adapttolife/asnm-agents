import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { DATABASE_NAME, FILLABLE_FIELDS, IS_PRODUCTION, WRANGLER_CONFIG } from "./config.js";

const execFile = promisify(execFileCallback);
const empty = (column) => `NULLIF(TRIM(COALESCE(${column}, '')), '') IS NULL`;
const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

export function parseWranglerJson(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`Wrangler did not return JSON: ${stdout}`);

  const payload = JSON.parse(stdout.slice(start));
  if (payload.some((entry) => !entry?.success)) throw new Error(JSON.stringify(payload));
  return payload.flatMap((entry) => entry.results || []);
}

async function execute(sql) {
  if (DATABASE_NAME !== (IS_PRODUCTION ? "asnm-db" : "asnm-db-staging")) {
    throw new Error("Unsafe D1 target.");
  }

  try {
    const { stdout, stderr } = await execFile(
      "npx",
      ["wrangler", "d1", "execute", DATABASE_NAME, "--config", WRANGLER_CONFIG, "--remote", "--json", "--command", sql],
      { maxBuffer: 16 * 1024 * 1024 },
    );
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
  const idFilter = id ? `id = ${quote(id)} AND ` : "";
  const fillable = FILLABLE_FIELDS.map((field) => empty(field)).join(" OR ");
  const rowLimit = limit === Infinity ? "" : ` LIMIT ${Math.max(1, Number(limit) || 1)}`;
  return execute(`SELECT * FROM grants WHERE ${idFilter}(${fillable}) ORDER BY name COLLATE NOCASE${rowLimit}`);
}

export async function applyPatch(id, patch) {
  const entries = Object.entries(patch).filter(([field, value]) =>
    FILLABLE_FIELDS.includes(field) && value !== null && value !== undefined && value !== "",
  );
  if (!entries.length) return false;

  const assignments = entries.map(([field, value]) =>
    `${field} = COALESCE(NULLIF(TRIM(${field}), ''), ${quote(value)})`,
  );
  const guards = entries.map(([field]) => empty(field));
  await execute(`UPDATE grants SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ${quote(id)} AND (${guards.join(" OR ")})`);
  return true;
}
