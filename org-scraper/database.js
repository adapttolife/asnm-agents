import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { DATABASE_NAME, IS_PRODUCTION, WRANGLER_CONFIG } from "./config.js";

const execFile = promisify(execFileCallback);
const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

function parse(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`Wrangler did not return JSON: ${stdout}`);
  const payload = JSON.parse(stdout.slice(start));
  if (payload.some((entry) => !entry?.success)) throw new Error(JSON.stringify(payload));
  return payload.flatMap((entry) => entry.results || []);
}

async function execute(sql) {
  if (DATABASE_NAME !== (IS_PRODUCTION ? "asnm-db" : "asnm-db-staging")) throw new Error("Unsafe D1 target.");
  try {
    const { stdout, stderr } = await execFile("npx", ["wrangler", "d1", "execute", DATABASE_NAME, "--config", WRANGLER_CONFIG, "--remote", "--json", "--command", sql], { maxBuffer: 16 * 1024 * 1024 });
    if (stderr && !stdout) throw new Error(stderr);
    return parse(stdout);
  } catch (error) {
    throw new Error([error.message, error.stdout, error.stderr].filter(Boolean).join("\n"), { cause: error });
  }
}

export async function sports() {
  return execute("SELECT sport_key, name FROM sports ORDER BY name COLLATE NOCASE");
}

export async function claimPair(pair, sportKey, token, refreshDays, lockMs) {
  const expiresAt = new Date(Date.now() + lockMs).toISOString();
  const cooldown = `-${Number(refreshDays)} days`;
  return execute(`INSERT INTO organization_discovery_pairs (sport_key, area_kind, area_id, area_name, state, county, city, lock_token, locked_at, lock_expires_at, created_at, updated_at) VALUES (${quote(sportKey)}, ${quote(pair.kind)}, ${quote(pair.id)}, ${quote(pair.name)}, ${quote(pair.state)}, ${quote(pair.county)}, ${quote(pair.city)}, ${quote(token)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${quote(expiresAt)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(sport_key, area_kind, area_id) DO UPDATE SET lock_token = excluded.lock_token, locked_at = excluded.locked_at, lock_expires_at = excluded.lock_expires_at, updated_at = excluded.updated_at WHERE (organization_discovery_pairs.lock_expires_at IS NULL OR organization_discovery_pairs.lock_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AND (organization_discovery_pairs.last_scraped_at IS NULL OR organization_discovery_pairs.last_scraped_at < datetime('now', ${quote(cooldown)})) RETURNING sport_key, area_kind, area_id`);
}

export async function releasePair(pair, sportKey, token) {
  return execute(`UPDATE organization_discovery_pairs SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, last_scraped_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sport_key = ${quote(sportKey)} AND area_kind = ${quote(pair.kind)} AND area_id = ${quote(pair.id)} AND lock_token = ${quote(token)}`);
}

export async function unlockPair(pair, sportKey, token) {
  return execute(`UPDATE organization_discovery_pairs SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sport_key = ${quote(sportKey)} AND area_kind = ${quote(pair.kind)} AND area_id = ${quote(pair.id)} AND lock_token = ${quote(token)}`);
}

export async function existingOrganizations(pair) {
  const location = pair.kind === "city" ? `state = ${quote(pair.state)} AND lower(trim(city)) = lower(${quote(pair.city)})` : `state = ${quote(pair.state)}`;
  return execute(`SELECT name, website_url FROM organizations WHERE ${location}`);
}

export async function insertOrganization(candidate, sport, pair) {
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  const duplicate = `(lower(trim(name)) = lower(${quote(candidate.name)}) OR (${candidate.website_url ? `lower(trim(COALESCE(website_url, ''))) = lower(${quote(candidate.website_url)})` : "0"}))`;
  return execute(`INSERT INTO organizations (id, name, sport, sport_key, sports_json, website_url, city, state, state_name, data_quality_rating, primary_data_source, verification_method, verification_status, status, is_public, publicity_consent, address_publicity_consent, created_at, updated_at) SELECT ${quote(candidate.id)}, ${quote(candidate.name)}, ${quote(sport.name)}, ${quote(sport.sport_key)}, ${quote(JSON.stringify([sport]))}, ${candidate.website_url ? quote(candidate.website_url) : "NULL"}, ${pair.city ? quote(pair.city) : "NULL"}, ${quote(pair.state)}, ${quote(pair.state_name)}, 'low', 'org_scraper', 'org_scraper', 'unverified', 'filling', 0, 0, 0, ${now}, ${now} WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE ${duplicate})`);
}
