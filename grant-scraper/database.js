import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { DATABASE_NAME, IS_PRODUCTION, WRANGLER_CONFIG } from "./config.js";

const execFile = promisify(execFileCallback);
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

export async function claimAreaPair(pair, sportKey, token, refreshDays, lockMs) {
  const expiresAt = new Date(Date.now() + lockMs).toISOString();
  const cooldown = `-${Number(refreshDays)} days`;
  return execute(`INSERT INTO grant_discovery_pairs (sport_key, area_kind, area_id, area_name, state, county, city, lock_token, locked_at, lock_expires_at, created_at, updated_at) VALUES (${quote(sportKey)}, ${quote(pair.kind)}, ${quote(pair.id)}, ${quote(pair.name)}, ${quote(pair.state)}, ${quote(pair.county)}, ${quote(pair.city)}, ${quote(token)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${quote(expiresAt)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(sport_key, area_kind, area_id) DO UPDATE SET lock_token = excluded.lock_token, locked_at = excluded.locked_at, lock_expires_at = excluded.lock_expires_at, updated_at = excluded.updated_at WHERE (grant_discovery_pairs.lock_expires_at IS NULL OR grant_discovery_pairs.lock_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AND (grant_discovery_pairs.last_scraped_at IS NULL OR grant_discovery_pairs.last_scraped_at < datetime('now', ${quote(cooldown)})) RETURNING sport_key, area_kind, area_id`);
}

export async function releaseAreaPair(pair, sportKey, token) {
  return execute(`UPDATE grant_discovery_pairs SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, last_scraped_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sport_key = ${quote(sportKey)} AND area_kind = ${quote(pair.kind)} AND area_id = ${quote(pair.id)} AND lock_token = ${quote(token)}`);
}

export async function unlockAreaPair(pair, sportKey, token) {
  return execute(`UPDATE grant_discovery_pairs SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sport_key = ${quote(sportKey)} AND area_kind = ${quote(pair.kind)} AND area_id = ${quote(pair.id)} AND lock_token = ${quote(token)}`);
}

export function insertGrantSql(candidate) {
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  return `INSERT INTO grants (id, name, source_url, audience, is_open, is_renewable, is_public, status, created_at, updated_at) SELECT ${quote(candidate.id)}, ${quote(candidate.name)}, ${quote(candidate.source_url)}, 'athlete', 0, 0, 0, 'pending', ${now}, ${now} WHERE NOT EXISTS (SELECT 1 FROM grants WHERE lower(trim(name)) = lower(trim(${quote(candidate.name)})) OR lower(trim(COALESCE(source_url, ''))) = lower(trim(${quote(candidate.source_url)})))`;
}

export async function insertGrant(candidate) {
  return execute(insertGrantSql(candidate));
}
