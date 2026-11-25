import { randomUUID } from "node:crypto";

function normalized(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanName(value) {
  return String(value || "")
    .replace(/\s+(?:\||\u2013|\u2014)\s+(?:official(?: website| site)?|apply(?: now)?|application|home)\b.*$/i, "")
    .trim();
}

function publicSourceUrl(value) {
  try {
    const url = new URL(value);
    if (!(["http:", "https:"].includes(url.protocol)) || !url.hostname.includes(".")) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) return null;
    if (/facebook|instagram|linkedin|youtube|tiktok|google\./i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function grantResult(result) {
  const name = cleanName(result.title);
  const sourceUrl = publicSourceUrl(result.url);
  const evidence = normalized(`${result.title || ""} ${result.description || ""}`);
  if (name.length < 5 || name.length > 180 || !sourceUrl) return null;
  if (!/\b(grant|scholarship|award|funding|financial assistance)\b/.test(evidence)) return null;
  if (/\b(grant writing|grant writer|grant proposal|apply for a grant)\b/.test(evidence)) return null;

  return { id: randomUUID(), name, source_url: sourceUrl };
}

function grantKey(grant) {
  return normalized(grant.name);
}

export function areaSearchQuery(sport, area) {
  const location = `${area.name}${area.state ? `, ${area.state}` : ""}`;
  return `adaptive sports disability ${sport.name} grant scholarship funding ${location}`;
}

export function newGrants(results, existing = []) {
  const knownNames = new Set(existing.map(grantKey));
  const knownUrls = new Set(existing.map((grant) => String(grant.source_url || "").toLowerCase()));
  const seenNames = new Set();
  const seenUrls = new Set();

  return results
    .map(grantResult)
    .filter(Boolean)
    .filter((grant) => {
      const name = grantKey(grant);
      const url = grant.source_url.toLowerCase();
      if (knownNames.has(name) || knownUrls.has(url) || seenNames.has(name) || seenUrls.has(url)) return false;
      seenNames.add(name);
      seenUrls.add(url);
      return true;
    });
}
