import { randomUUID } from "node:crypto";

function normalized(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameFromTitle(title) {
  return String(title || "")
    .split(/\s[|\-–—]\s/)[0]
    .replace(/\s+\|.*$/, "")
    .trim();
}

function usableName(name) {
  return (
    name.length >= 3 &&
    name.length <= 160 &&
    !/^(facebook|instagram|linkedin|youtube|yelp|google|home)$/i.test(name)
  );
}

function candidatesFromResults(results, existing, predicate = () => true) {
  const existingNames = new Set(existing.map((row) => normalized(row.name)));
  const existingUrls = new Set(
    existing
      .map((row) => String(row.website_url || "").toLowerCase())
      .filter(Boolean),
  );
  const found = new Set();

  return results
    .map((result) => ({
      name: nameFromTitle(result.title),
      website_url: result.url,
      description: result.description || "",
      title: result.title || "",
    }))
    .filter((candidate) => {
      const name = normalized(candidate.name);
      const url = candidate.website_url.toLowerCase();
      if (
        !usableName(candidate.name) ||
        !name ||
        existingNames.has(name) ||
        existingUrls.has(url) ||
        found.has(`${name}|${url}`) ||
        !predicate(candidate)
      ) {
        return false;
      }
      found.add(`${name}|${url}`);
      return true;
    })
    .map(({ title, description, ...candidate }) => ({
      id: randomUUID(),
      ...candidate,
    }));
}

export function searchQuery(sport, area) {
  return `adaptive ${sport.name} organizations in ${area.name}${area.state ? `, ${area.state}` : ""}`;
}

export function newOrganizations(results, existing) {
  return candidatesFromResults(results, existing);
}
