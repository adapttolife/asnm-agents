import { randomUUID } from "node:crypto";

function normalized(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function parseDateToken(token) {
  const isoDateTime = token.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:\d{2})$/i);
  if (isoDateTime) {
    const timestamp = Date.parse(token);
    return Number.isFinite(timestamp)
      ? { date: new Date(timestamp), allDay: 0 }
      : null;
  }

  const isoDate = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const date = validDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
    return date ? { date, allDay: 1 } : null;
  }

  const numericDate = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numericDate) {
    const date = validDate(Number(numericDate[3]), Number(numericDate[1]), Number(numericDate[2]));
    return date ? { date, allDay: 1 } : null;
  }

  const monthDate = Date.parse(`${token} UTC`);
  if (Number.isFinite(monthDate)) {
    const date = new Date(monthDate);
    if (date.getUTCFullYear() >= 1900) return { date, allDay: 1 };
  }

  return null;
}

function dateMatches(text) {
  const pattern = /\b(?:20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})|20\d{2}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})\b/gi;
  return [...String(text || "").matchAll(pattern)]
    .map((match) => ({ token: match[0].replace(/(\d)(st|nd|rd|th)\b/i, "$1").replace(/,$/, ""), index: match.index }))
    .map((match) => ({ ...match, parsed: parseDateToken(match.token) }))
    .filter((match) => match.parsed)
    .sort((left, right) => left.index - right.index);
}

function eventDate(title, description) {
  const text = `${title} ${description}`;
  const matches = dateMatches(text);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const start = matches.find((match) => match.parsed.date.getTime() >= todayUtc);
  if (!start) return null;

  const end = matches.find((match) => {
    if (match.index <= start.index || match.parsed.date <= start.parsed.date) return false;
    const between = text.slice(start.index + start.token.length, match.index);
    return /^\s*(?:-|\u2013|\u2014|to|through|until)\s*$/i.test(between);
  });

  return {
    starts_at: start.parsed.date.toISOString(),
    ends_at: end ? end.parsed.date.toISOString() : null,
    all_day: start.parsed.allDay,
  };
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+(?:\||-|\u2013|\u2014)\s+(?:home|official(?: website| site)?|registration|eventbrite|tickets?)\b.*$/i, "")
    .trim();
}

function usableTitle(title) {
  return title.length >= 4 && title.length <= 180 && !/^(facebook|instagram|linkedin|youtube|google|events?)$/i.test(title);
}

function candidateFromResult(result) {
  const title = cleanTitle(result.title);
  const date = eventDate(result.title, result.description);
  if (!usableTitle(title) || !date || !/^https?:\/\//i.test(result.url || "")) return null;

  return {
    id: randomUUID(),
    title,
    url: result.url,
    ...date,
  };
}

function eventKey(event) {
  const day = String(event.starts_at || "").slice(0, 10);
  return `${normalized(event.title)}|${day}`;
}

function duplicate(candidate, existing) {
  const key = eventKey(candidate);
  return existing.some((event) =>
    (candidate.url && String(event.url || "").toLowerCase() === candidate.url.toLowerCase()) ||
    eventKey(event) === key,
  );
}

function uniqueCandidates(results, existing, predicate = () => true) {
  const seen = new Set();
  return results
    .map(candidateFromResult)
    .filter(Boolean)
    .filter((candidate) => {
      const key = eventKey(candidate);
      if (duplicate(candidate, existing) || seen.has(key) || !predicate(candidate)) return false;
      seen.add(key);
      return true;
    });
}

export function areaSearchQuery(sport, area, year = new Date().getFullYear()) {
  const location = `${area.name}${area.state ? `, ${area.state}` : ""}`;
  return `adaptive ${sport.name} events tournaments competitions ${location} ${year}`;
}

export function entitySearchQuery(target, year = new Date().getFullYear()) {
  const values = [
    `"${target.entity_name}"`,
    target.program_name ? `"${target.program_name}"` : "",
    target.organization_name && target.organization_name !== target.entity_name ? `"${target.organization_name}"` : "",
    target.sport_name,
    "adaptive sports events tournament schedule",
    target.city,
    target.state,
    String(year),
  ].filter(Boolean);
  return values.join(" ");
}

export function newAreaEvents(results, existing) {
  return uniqueCandidates(results, existing);
}

export function newEntityEvents(results, existing, target) {
  const identity = [target.entity_name, target.program_name, target.organization_name]
    .filter(Boolean)
    .map(normalized)
    .filter((value) => value.length >= 4);
  let targetHost = "";
  try {
    targetHost = new URL(target.website_url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {}

  return uniqueCandidates(results, existing, (candidate) => {
    const result = results.find((item) => item.url === candidate.url);
    const text = normalized(`${result?.title || ""} ${result?.description || ""}`);
    if (identity.some((value) => text.includes(value))) return true;
    if (!targetHost) return false;

    try {
      const resultHost = new URL(candidate.url).hostname.toLowerCase().replace(/^www\./, "");
      return resultHost === targetHost || resultHost.endsWith(`.${targetHost}`);
    } catch {
      return false;
    }
  });
}
