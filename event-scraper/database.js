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
    return parse(stdout);
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
  return execute(`INSERT INTO event_discovery_pairs (sport_key, area_kind, area_id, area_name, state, county, city, lock_token, locked_at, lock_expires_at, created_at, updated_at) VALUES (${quote(sportKey)}, ${quote(pair.kind)}, ${quote(pair.id)}, ${quote(pair.name)}, ${quote(pair.state)}, ${quote(pair.county)}, ${quote(pair.city)}, ${quote(token)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${quote(expiresAt)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(sport_key, area_kind, area_id) DO UPDATE SET lock_token = excluded.lock_token, locked_at = excluded.locked_at, lock_expires_at = excluded.lock_expires_at, updated_at = excluded.updated_at WHERE (event_discovery_pairs.lock_expires_at IS NULL OR event_discovery_pairs.lock_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AND (event_discovery_pairs.last_scraped_at IS NULL OR event_discovery_pairs.last_scraped_at < datetime('now', ${quote(cooldown)})) RETURNING sport_key, area_kind, area_id`);
}

export async function releaseAreaPair(pair, sportKey, token) {
  return execute(`UPDATE event_discovery_pairs SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, last_scraped_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sport_key = ${quote(sportKey)} AND area_kind = ${quote(pair.kind)} AND area_id = ${quote(pair.id)} AND lock_token = ${quote(token)}`);
}

export async function unlockAreaPair(pair, sportKey, token) {
  return execute(`UPDATE event_discovery_pairs SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sport_key = ${quote(sportKey)} AND area_kind = ${quote(pair.kind)} AND area_id = ${quote(pair.id)} AND lock_token = ${quote(token)}`);
}

export async function existingEventsForArea(pair, sportKey) {
  const city = pair.kind === "city" ? `AND lower(trim(COALESCE(city, ''))) = lower(${quote(pair.city)})` : "";
  return execute(`SELECT id, title, url, starts_at FROM events WHERE sport_key = ${quote(sportKey)} AND state = ${quote(pair.state)} ${city} AND starts_at >= date('now') ORDER BY starts_at LIMIT 1000`);
}

export async function dueEntityTargets(refreshDays = 90) {
  const cooldown = `-${Number(refreshDays)} days`;
  const placeholderId = "a461f29b-0b89-4e17-b879-6a80e0abd101";
  return execute(`SELECT target.* FROM (
    SELECT 'organization' AS entity_type, o.id AS entity_id, o.name AS entity_name, o.name AS organization_name, NULL AS program_name, COALESCE(s.name, o.sport) AS sport_name, o.sport_key, o.id AS org_id, NULL AS program_id, o.website_url, o.city, o.state
    FROM organizations o LEFT JOIN sports s ON s.sport_key = o.sport_key
    WHERE o.status = 'active' AND (NULLIF(TRIM(COALESCE(o.website_url, '')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(o.city, '')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(o.state, '')), '') IS NOT NULL)
    UNION ALL
    SELECT 'program' AS entity_type, p.id AS entity_id, p.name AS entity_name, o.name AS organization_name, p.name AS program_name, COALESCE(s.name, p.sport) AS sport_name, p.sport_key, CASE WHEN p.organization_id = ${quote(placeholderId)} THEN NULL ELSE p.organization_id END AS org_id, p.id AS program_id, COALESCE(NULLIF(TRIM(p.website_url), ''), o.website_url) AS website_url, COALESCE(NULLIF(TRIM(p.city), ''), o.city) AS city, COALESCE(NULLIF(TRIM(p.state), ''), o.state) AS state
    FROM programs p LEFT JOIN organizations o ON o.id = p.organization_id LEFT JOIN sports s ON s.sport_key = p.sport_key
    WHERE p.kind = 'program' AND p.status IN ('active', 'filling') AND (NULLIF(TRIM(COALESCE(p.website_url, '')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(p.city, '')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(p.state, '')), '') IS NOT NULL)
  ) AS target LEFT JOIN event_entity_discovery d ON d.entity_type = target.entity_type AND d.entity_id = target.entity_id
  WHERE d.entity_id IS NULL OR ((d.lock_expires_at IS NULL OR d.lock_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AND (d.last_scraped_at IS NULL OR d.last_scraped_at < datetime('now', ${quote(cooldown)})))
  ORDER BY RANDOM() LIMIT 60`);
}

export async function claimEntityTarget(entityType, entityId, token, lockMs, refreshDays = 90) {
  const expiresAt = new Date(Date.now() + lockMs).toISOString();
  const cooldown = `-${Number(refreshDays)} days`;
  return execute(`INSERT INTO event_entity_discovery (entity_type, entity_id, lock_token, locked_at, lock_expires_at, created_at, updated_at) VALUES (${quote(entityType)}, ${quote(entityId)}, ${quote(token)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${quote(expiresAt)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(entity_type, entity_id) DO UPDATE SET lock_token = excluded.lock_token, locked_at = excluded.locked_at, lock_expires_at = excluded.lock_expires_at, updated_at = excluded.updated_at WHERE (event_entity_discovery.lock_expires_at IS NULL OR event_entity_discovery.lock_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AND (event_entity_discovery.last_scraped_at IS NULL OR event_entity_discovery.last_scraped_at < datetime('now', ${quote(cooldown)})) RETURNING entity_id`);
}

export async function releaseEntityTarget(entityType, entityId, token) {
  return execute(`UPDATE event_entity_discovery SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, last_scraped_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE entity_type = ${quote(entityType)} AND entity_id = ${quote(entityId)} AND lock_token = ${quote(token)}`);
}

export async function unlockEntityTarget(entityType, entityId, token) {
  return execute(`UPDATE event_entity_discovery SET lock_token = NULL, locked_at = NULL, lock_expires_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE entity_type = ${quote(entityType)} AND entity_id = ${quote(entityId)} AND lock_token = ${quote(token)}`);
}

export async function existingEventsForTarget(target) {
  const relation = target.entity_type === "program"
    ? `program_id = ${quote(target.entity_id)}`
    : `org_id = ${quote(target.entity_id)}`;
  return execute(`SELECT id, title, url, starts_at FROM events WHERE ${relation} AND starts_at >= date('now') ORDER BY starts_at LIMIT 1000`);
}

function eventDuplicate(candidate, location) {
  const sameUrl = candidate.url
    ? `lower(trim(COALESCE(url, ''))) = lower(${quote(candidate.url)}) OR `
    : "";
  return `(${sameUrl}(lower(trim(title)) = lower(${quote(candidate.title)}) AND date(starts_at) = date(${quote(candidate.starts_at)}) AND lower(trim(COALESCE(city, ''))) = lower(${quote(location.city || "")}) AND lower(trim(COALESCE(state, ''))) = lower(${quote(location.state || "")}) AND COALESCE(sport_key, '') = ${quote(location.sport_key || "")}))`;
}

export async function insertEvent(candidate, location = {}) {
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  const duplicate = eventDuplicate(candidate, location);
  const columns = "id, title, description, org_id, sport_key, venue, city, state, url, starts_at, ends_at, all_day, status, is_public, source, created_at, updated_at, program_id";
  const values = [
    quote(candidate.id),
    quote(candidate.title),
    quote(candidate.description || ""),
    location.org_id ? quote(location.org_id) : "NULL",
    location.sport_key ? quote(location.sport_key) : "NULL",
    candidate.venue ? quote(candidate.venue) : "NULL",
    location.city ? quote(location.city) : "NULL",
    location.state ? quote(location.state) : "NULL",
    candidate.url ? quote(candidate.url) : "NULL",
    quote(candidate.starts_at),
    candidate.ends_at ? quote(candidate.ends_at) : "NULL",
    Number(candidate.all_day) === 1 ? "1" : "0",
    "'scheduled'",
    "0",
    "'event_scraper'",
    now,
    now,
    location.program_id ? quote(location.program_id) : "NULL",
  ];

  return execute(`INSERT INTO events (${columns}) SELECT ${values.join(", ")} WHERE NOT EXISTS (SELECT 1 FROM events WHERE ${duplicate})`);
}
