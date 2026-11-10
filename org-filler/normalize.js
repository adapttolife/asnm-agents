import { STATE_NAMES } from "./config.js";

function normalized(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function deterministicFields(row, sports) {
  const patch = {};
  if (!row.sport_key && row.sport) {
    const sport = sports.find((candidate) => normalized(candidate.name) === normalized(row.sport));
    if (sport?.sport_key) patch.sport_key = sport.sport_key;
  }
  const state = String(row.state || "").toUpperCase();
  if (!row.state_name && STATE_NAMES[state]) patch.state_name = STATE_NAMES[state];
  return patch;
}