import { STATE_NAMES } from "./config.js";

function normalized(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function deterministicPatch(row, sportRows) {
  const patch = {};
  if (!row.slug && row.name && row.id) {
    const base = String(row.name)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    if (base) patch.slug = `${base}-${String(row.id).slice(0, 8)}`;
  }
  const matchedSport = row.sport_key
    ? sportRows.find((candidate) => candidate.sport_key === row.sport_key)
    : sportRows.find((candidate) => normalized(candidate.name) === normalized(row.sport));
  if (!row.sport_key && matchedSport?.sport_key) {
    patch.sport_key = matchedSport.sport_key;
  }
  if (!row.sport && matchedSport?.name) {
    patch.sport = matchedSport.name;
  }
  if (!row.sports_json && (row.sport_key || matchedSport?.sport_key)) {
    patch.sports_json = JSON.stringify([row.sport_key || matchedSport.sport_key]);
  }
  const state = String(row.state || "").toUpperCase();
  if (!row.state_name && STATE_NAMES[state]) patch.state_name = STATE_NAMES[state];
  return patch;
}

export function missingFields(row) {
  return Object.entries(row)
    .filter(([, value]) => (value === null) || (value === undefined) || (typeof value === "string" && value.trim() === ""))
    .map(([field]) => field);
}
