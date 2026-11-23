import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { DATABASE_NAME, FILLABLE_FIELDS, IS_PRODUCTION, WRANGLER_CONFIG } from "./config.js";

const execFile = promisify(execFileCallback);
const empty = (column) => `NULLIF(TRIM(COALESCE(${column}, '')), '') IS NULL`;
const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
export const FILL_ELIGIBILITY = "1 = 1";

function parseWranglerJson(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`Wrangler did not return JSON: ${stdout}`);

  const payload = JSON.parse(stdout.slice(start));
  if (payload.some((entry) => !entry?.success)) {
    throw new Error(JSON.stringify(payload));
  }

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
  return execute(`SELECT e.*, s.name AS sport_name, o.name AS organization_name, o.website_url AS organization_website_url, p.name AS program_name, p.website_url AS program_website_url FROM events e LEFT JOIN sports s ON s.sport_key = e.sport_key LEFT JOIN organizations o ON o.id = e.org_id LEFT JOIN programs p ON p.id = e.program_id WHERE ${id ? `e.id = ${quote(id)} AND ` : ""}(${FILLABLE_FIELDS.map((field) => empty(`e.${field}`)).join(" OR ")}) ORDER BY e.starts_at ASC, e.title COLLATE NOCASE${limit === Infinity ? "" : ` LIMIT ${Math.max(1, Number(limit) || 1)}`}`);
}

export async function applyPatch(id, patch) {
  const entries = Object.entries(patch).filter(([field, value]) =>
    FILLABLE_FIELDS.includes(field) && (value !== null) && (value !== undefined) && (value !== ""),
  );
  if (!entries.length) return false;

  await execute(`UPDATE events SET ${entries.map(([field, value]) => `${field} = COALESCE(NULLIF(TRIM(${field}), ''), ${quote(value)})`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ${quote(id)} AND (${entries.map(([field]) => empty(field)).join(" OR ")})`);
  return true;
}
