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
    !/^(facebook|instagram|linkedin|youtube|yelp|google|home|programs)$/i.test(
      name,
    )
  );
}

export function searchQuery(sport, area) {
  const location = `${area.name}${area.state ? `, ${area.state}` : ""}`;
  return `adaptive ${sport.name} programs in ${location}`;
}

export function newPrograms(results, existing) {
  const existingNames = new Set(existing.map((row) => normalized(row.name)));
  const found = new Set();

  return results
    .map((result) => ({
      name: nameFromTitle(result.title),
      website_url: result.url,
    }))
    .filter((candidate) => {
      const name = normalized(candidate.name);
      if (!usableName(candidate.name) || !name || existingNames.has(name)) {
        return false;
      }
      if (found.has(name)) return false;
      found.add(name);
      return true;
    })
    .map((candidate) => ({ id: randomUUID(), ...candidate }));
}

export function organizationProgramSearchQuery(organization) {
  const parts = [
    `"${organization.name}"`,
    organization.sport,
    "adaptive sports programs",
    organization.city,
    organization.state,
  ].filter(Boolean);
  if (organization.website_url) {
    try {
      parts.push(`site:${new URL(organization.website_url).hostname}`);
    } catch {}
  }
  return parts.join(" ");
}

export function newOrganizationPrograms(results, existing, organization) {
  let organizationHost = "";
  try {
    organizationHost = new URL(organization.website_url).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {}

  const organizationName = normalized(organization.name);
  const existingNames = new Set(existing.map((row) => normalized(row.name)));
  const found = new Set();

  return results
    .map((result) => ({
      name: nameFromTitle(result.title),
      website_url: result.url,
      title: result.title || "",
      description: result.description || "",
    }))
    .filter((candidate) => {
      const name = normalized(candidate.name);
      if (!usableName(candidate.name) || !name || existingNames.has(name) || found.has(name)) {
        return false;
      }

      if (organizationHost) {
        try {
          const resultHost = new URL(candidate.website_url).hostname
            .toLowerCase()
            .replace(/^www\./, "");
          if (resultHost !== organizationHost && !resultHost.endsWith(`.${organizationHost}`)) {
            return false;
          }
        } catch {
          return false;
        }
      } else {
        const evidence = normalized(`${candidate.title} ${candidate.description}`);
        if (organizationName.length < 3 || !evidence.includes(organizationName)) {
          return false;
        }
      }

      found.add(name);
      return true;
    })
    .map(({ title, description, ...candidate }) => ({ id: randomUUID(), ...candidate }));
}
