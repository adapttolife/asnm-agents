import { GoogleGenAI } from "@google/genai";
import { FILLABLE_FIELDS, GEMINI_MODELS, GEMINI_REQUESTS_PER_DAY, GEMINI_REQUESTS_PER_MINUTE, MAX_MARKDOWN_CHARS, STATE_NAMES } from "./config.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const states = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]));

function keys() {
  return [process.env.GEMINI_API_KEY, ...(process.env.GEMINI_API_KEYS || "").split(",")]
    .map((key) => String(key || "").trim())
    .filter(Boolean);
}

function dateInPacific() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export class GeminiPool {
  constructor({ keys: configuredKeys = keys(), models = GEMINI_MODELS } = {}) {
    this.keys = configuredKeys;
    this.models = models;
    this.cursor = new Map(this.models.map((model) => [model, 0]));
    this.state = new Map(this.models.flatMap((model) => this.keys.map((key) => [
      `${model}\u0000${key}`,
      { requests: [], date: "", daily: 0, blockedUntil: 0 },
    ])));
  }

  async acquire() {
    if (!this.keys.length) throw new Error("Set GEMINI_API_KEY before running event-filler");

    while (true) {
      const now = Date.now();
      const today = dateInPacific();

      for (const model of this.models) {
        const candidates = this.keys.map((key, index) => {
          const state = this.state.get(`${model}\u0000${key}`);
          if (state.date !== today) Object.assign(state, { date: today, daily: 0, requests: [] });
          state.requests = state.requests.filter((time) => time > (now - 60_000));
          if (state.daily >= GEMINI_REQUESTS_PER_DAY) return null;

          return {
            key,
            model,
            state,
            slot: Math.max(
              state.blockedUntil,
              (state.requests.length >= GEMINI_REQUESTS_PER_MINUTE)
                ? ((state.requests[0] || now) + 60_000)
                : now,
            ),
            order: (index - this.cursor.get(model) + this.keys.length) % this.keys.length,
          };
        }).filter(Boolean);

        if (!candidates.length) continue;
        candidates.sort((left, right) => (left.slot - right.slot) || (left.order - right.order));
        const selected = candidates[0];
        if (selected.slot > now) {
          await wait(selected.slot - now);
          break;
        }

        selected.state.requests.push(now);
        selected.state.daily++;
        this.cursor.set(model, (this.keys.indexOf(selected.key) + 1) % this.keys.length);
        return selected;
      }

      if (this.models.every((model) => this.keys.every((key) =>
        this.state.get(`${model}\u0000${key}`).daily >= GEMINI_REQUESTS_PER_DAY,
      ))) {
        throw new Error("Every configured Gemini model and key has reached its daily request limit");
      }
    }
  }

  rateLimited(selected, daily = false) {
    const state = this.state.get(`${selected.model}\u0000${selected.key}`);
    if (daily) state.daily = GEMINI_REQUESTS_PER_DAY;
    else state.blockedUntil = Date.now() + 60_000;
  }
}

function dailyQuota(error) {
  return /daily|per.?day|quota.*day/i.test(String(error?.message || ""));
}

function schema() {
  return {
    type: "object",
    properties: {
      fields: {
        type: "object",
        properties: {
          description: { type: "string" },
          sport_key: { type: "string" },
          venue: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          url: { type: "string" },
          starts_at: { type: "string" },
          ends_at: { type: "string" },
          recap_url: { type: "string" },
        },
        additionalProperties: false,
      },
      evidence: {
        type: "object",
        additionalProperties: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    required: ["fields", "evidence"],
    additionalProperties: false,
  };
}

function sourceText(pages) {
  const includedUrls = new Set();
  let markdown = "";

  for (const page of pages) {
    const source = `\n\n--- SOURCE: ${page.url} ---\n# ${page.title || "Untitled"}\n${page.markdown}`;
    if ((markdown.length + source.length) > MAX_MARKDOWN_CHARS) {
      if (!markdown.length) {
        markdown = source.slice(0, MAX_MARKDOWN_CHARS);
        includedUrls.add(page.url);
      }
      break;
    }

    markdown += source;
    includedUrls.add(page.url);
  }

  return { markdown, includedUrls };
}

export async function fillMissing(pool, event, missing, sportRows, pages) {
  if (!missing.length || !pages.length) return {};

  const context = sourceText(pages);
  const prompt = `Use only the supplied website Markdown to fill explicitly requested empty details for this adaptive-sports event. Do not infer dates, time zones, venue, or other facts. Return only supported fields and include the exact source URL as evidence for every returned field. For starts_at and ends_at, use ISO 8601 with an explicit timezone; return a date-only ISO value only when the source says the event is all-day. Preserve unknown values as absent. Do not return or change organization IDs, program IDs, event status, visibility, or source.\n\nEvent: ${JSON.stringify({ title: event.title, description: event.description, starts_at: event.starts_at, ends_at: event.ends_at, url: event.url, sport: event.sport_name, city: event.city, state: event.state, organization_name: event.organization_name, program_name: event.program_name })}\nMissing fields requested: ${JSON.stringify(missing)}\nAllowed sport keys: ${JSON.stringify(sportRows)}\n\nWebsite Markdown:${context.markdown}`;

  for (let attempt = 0; attempt < (pool.keys.length * pool.models.length); attempt++) {
    const selected = await pool.acquire();

    try {
      const ai = new GoogleGenAI({ apiKey: selected.key });
      const response = await ai.models.generateContent({
        model: selected.model,
        contents: prompt,
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: schema(),
        },
      });
      const parsed = JSON.parse(response.text || "{}");

      return Object.fromEntries(Object.entries(parsed?.fields || {}).filter(([field]) =>
        missing.includes(field) &&
        Array.isArray(parsed?.evidence?.[field]) &&
        parsed.evidence[field].some((url) => context.includedUrls.has(url)),
      ));
    } catch (error) {
      if ((error?.status === 429) || /\b429\b/.test(error?.message || "")) {
        pool.rateLimited(selected, dailyQuota(error));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Every Gemini key was rate limited");
}

function normalizedTimestamp(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
  const timestampWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(input);
  if (!dateOnly && !timestampWithZone) return null;

  const timestamp = Date.parse(dateOnly ? `${input}T00:00:00.000Z` : input);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizePatch(fields, sportRows) {
  const sportKeys = new Set(sportRows.map((sport) => sport.sport_key));
  const patch = {};

  if (typeof fields.description === "string" && fields.description.trim()) {
    patch.description = fields.description.trim().slice(0, 3000);
  }
  if (sportKeys.has(fields.sport_key)) patch.sport_key = fields.sport_key;
  if (typeof fields.venue === "string" && fields.venue.trim()) patch.venue = fields.venue.trim().slice(0, 200);
  if (typeof fields.city === "string" && fields.city.trim()) patch.city = fields.city.trim().slice(0, 120);

  const rawState = String(fields.state || "").trim();
  const state = STATE_NAMES[rawState.toUpperCase()] ? rawState.toUpperCase() : states.get(rawState.toLowerCase());
  if (state) patch.state = state;

  for (const field of ["url", "recap_url"]) {
    if (/^https?:\/\/[^\s]+$/i.test(fields[field] || "")) patch[field] = fields[field].trim();
  }

  const startsAt = normalizedTimestamp(fields.starts_at);
  const endsAt = normalizedTimestamp(fields.ends_at);
  if (startsAt) patch.starts_at = startsAt;
  if (endsAt && (!startsAt || Date.parse(endsAt) >= Date.parse(startsAt))) patch.ends_at = endsAt;

  return Object.fromEntries(Object.entries(patch).filter(([field]) => FILLABLE_FIELDS.includes(field)));
}
