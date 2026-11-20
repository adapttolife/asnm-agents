import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { DATABASE_NAME, IS_PRODUCTION, WRANGLER_CONFIG } from "./config.js";

const execFile = promisify(execFileCallback);
const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
export const PROGRAM_PLACEHOLDER_ORGANIZATION_ID = "a461f29b-0b89-4e17-b879-6a80e0abd101";

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
  return execute(`INSERT INTO program_discovery_pairs (sport_key, area_kind, area_id, area_name, state, county, city, lock_token, locked_at, lock_expires_at, created_at, updated_at) VALUES (${quote(sportKey)}, ${quote(pair.kind)}, ${quote(pair.id)}, ${quote(pair.name)}, ${quote(pair.state)}, ${quote(pair.county)}, ${quote(pair.city)}, ${quote(token)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${quote(expiresAt)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(sport_key, area_kind, area_id) DO UPDATE SET lock_token = excluded.lock_token, locked_at = excluded.locked_at, lock_expires_at = excluded.lock_expires_at, updated_at = excluded.updated_at WHERE (program_discovery_pairs.lock_expires_at IS NULL OR program_discovery_pairs.lock_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AND (program_discovery_pairs.last_scraped_at IS NULL OR program_discovery_pairs.last_scraped_at < datetime('now', ${quote(cooldown)})) RETURNING sport_key, area_kind, area_id`);
}

export async function releasePair(pair, sportKey, token) {
  return execute(`UPDATE program_discovery_pairs SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, last_scraped_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sport_key = ${quote(sportKey)} AND area_kind = ${quote(pair.kind)} AND area_id = ${quote(pair.id)} AND lock_token = ${quote(token)}`);
}

export async function unlockPair(pair, sportKey, token) {
  return execute(`UPDATE program_discovery_pairs SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sport_key = ${quote(sportKey)} AND area_kind = ${quote(pair.kind)} AND area_id = ${quote(pair.id)} AND lock_token = ${quote(token)}`);
}

export async function existingPrograms(pair, sportKey) {
  const location = pair.kind === "city"
    ? `AND lower(trim(city)) = lower(${quote(pair.city)})`
    : "";
  return execute(`SELECT name, website_url, city FROM programs WHERE kind = 'program' AND sport_key = ${quote(sportKey)} AND state = ${quote(pair.state)} ${location}`);
}

export async function insertProgram(candidate, sport, pair) {
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  const duplicate = `lower(trim(name)) = lower(${quote(candidate.name)}) AND sport_key = ${quote(sport.sport_key)} AND state = ${quote(pair.state)}${pair.kind === "city" ? ` AND lower(trim(COALESCE(city, ''))) = lower(${quote(pair.city)})` : ""}`;
  return execute(`INSERT INTO programs (id, organization_id, name, sport, sport_key, sports_json, website_url, city, state, state_name, publicity_consent, address_publicity_consent, verification_status, verification_method, status, is_public, kind, listing, created_at, updated_at) SELECT ${quote(candidate.id)}, ${quote(PROGRAM_PLACEHOLDER_ORGANIZATION_ID)}, ${quote(candidate.name)}, ${quote(sport.name)}, ${quote(sport.sport_key)}, ${quote(JSON.stringify([sport.sport_key]))}, ${candidate.website_url ? quote(candidate.website_url) : "NULL"}, ${pair.city ? quote(pair.city) : "NULL"}, ${quote(pair.state)}, ${quote(pair.state_name)}, 0, 0, 'unverified', 'program_scraper', 'filling', 0, 'program', 'own', ${now}, ${now} WHERE EXISTS (SELECT 1 FROM organizations WHERE id = ${quote(PROGRAM_PLACEHOLDER_ORGANIZATION_ID)}) AND NOT EXISTS (SELECT 1 FROM programs WHERE ${duplicate})`);
}

export async function dueOrganizationsForProgramDiscovery(refreshDays = 183) {
  const cooldown = `-${Number(refreshDays)} days`;
  return execute(`SELECT o.id, o.name, o.sport, o.sport_key, o.sports_json, o.website_url, o.city, o.state, o.state_name FROM organizations o WHERE o.status = 'active' AND (NULLIF(TRIM(COALESCE(o.website_url, '')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(o.city, '')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(o.state, '')), '') IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM organization_program_discovery d WHERE d.organization_id = o.id AND ((d.lock_expires_at IS NOT NULL AND d.lock_expires_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) OR (d.last_scraped_at IS NOT NULL AND d.last_scraped_at >= datetime('now', ${quote(cooldown)})))) ORDER BY RANDOM() LIMIT 50`);
}

export async function claimOrganizationProgramDiscovery(organizationId, token, lockMs, refreshDays = 183) {
  const expiresAt = new Date(Date.now() + lockMs).toISOString();
  const cooldown = `-${Number(refreshDays)} days`;
  return execute(`INSERT INTO organization_program_discovery (organization_id, lock_token, locked_at, lock_expires_at, created_at, updated_at) VALUES (${quote(organizationId)}, ${quote(token)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${quote(expiresAt)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(organization_id) DO UPDATE SET lock_token = excluded.lock_token, locked_at = excluded.locked_at, lock_expires_at = excluded.lock_expires_at, updated_at = excluded.updated_at WHERE (organization_program_discovery.lock_expires_at IS NULL OR organization_program_discovery.lock_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AND (organization_program_discovery.last_scraped_at IS NULL OR organization_program_discovery.last_scraped_at < datetime('now', ${quote(cooldown)})) RETURNING organization_id`);
}

export async function releaseOrganizationProgramDiscovery(organizationId, token) {
  return execute(`UPDATE organization_program_discovery SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, last_scraped_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE organization_id = ${quote(organizationId)} AND lock_token = ${quote(token)}`);
}

export async function unlockOrganizationProgramDiscovery(organizationId, token) {
  return execute(`UPDATE organization_program_discovery SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE organization_id = ${quote(organizationId)} AND lock_token = ${quote(token)}`);
}

export async function existingProgramsForOrganization(organizationId) {
  return execute(`SELECT id, name, website_url FROM programs WHERE organization_id = ${quote(organizationId)} AND kind = 'program'`);
}

export async function insertProgramForOrganization(candidate, organization) {
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  const duplicate = `organization_id = ${quote(organization.id)} AND kind = 'program' AND lower(trim(name)) = lower(${quote(candidate.name)})`;
  return execute(`INSERT INTO programs (id, organization_id, name, website_url, city, state, state_name, verification_status, verification_method, status, is_public, publicity_consent, address_publicity_consent, kind, listing, created_at, updated_at) SELECT ${quote(candidate.id)}, ${quote(organization.id)}, ${quote(candidate.name)}, ${candidate.website_url ? quote(candidate.website_url) : "NULL"}, ${organization.city ? quote(organization.city) : "NULL"}, ${organization.state ? quote(organization.state) : "NULL"}, ${organization.state_name ? quote(organization.state_name) : "NULL"}, 'unverified', 'program_scraper', 'filling', 0, 0, 0, 'program', 'with_org', ${now}, ${now} WHERE NOT EXISTS (SELECT 1 FROM programs WHERE ${duplicate})`);
}
