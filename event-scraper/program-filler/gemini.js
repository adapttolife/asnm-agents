import { GoogleGenAI } from "@google/genai";
import { FILLABLE_FIELDS, GEMINI_MODELS, GEMINI_REQUESTS_PER_DAY, GEMINI_REQUESTS_PER_MINUTE, MAX_MARKDOWN_CHARS, STATE_NAMES } from "./config.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const states = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]));

function keys() {
  return [process.env.GEMINI_API_KEY, ...(process.env.GEMINI_API_KEYS || "").split(",")].map((key) => String(key || "").trim()).filter(Boolean);
}

function dateInPacific() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export class GeminiPool {
  constructor({ keys: configuredKeys = keys(), models = GEMINI_MODELS } = {}) {
    this.keys = configuredKeys;
    this.models = models;
    this.cursor = new Map(this.models.map((model) => [model, 0]));
    this.state = new Map(this.models.flatMap((model) => this.keys.map((key) => [`${model}\u0000${key}`, { requests: [], date: "", daily: 0, blockedUntil: 0 }])));
  }

  async acquire() {
    if (!this.keys.length) throw new Error("Set GEMINI_API_KEY before running program-filler");
    while (true) {
      const now = Date.now();
      const today = dateInPacific();
      for (const model of this.models) {
        const candidates = this.keys.map((key, index) => {
          const state = this.state.get(`${model}\u0000${key}`);
          if (state.date !== today) Object.assign(state, { date: today, daily: 0, requests: [] });
          state.requests = state.requests.filter((time) => time > (now - 60_000));
          if (state.daily >= GEMINI_REQUESTS_PER_DAY) return null;
          return { key, model, state, slot: Math.max(state.blockedUntil, (state.requests.length >= GEMINI_REQUESTS_PER_MINUTE) ? ((state.requests[0] || now) + 60_000) : now), order: (index - this.cursor.get(model) + this.keys.length) % this.keys.length };
        }).filter(Boolean);
        if (!candidates.length) continue;
        candidates.sort((a, b) => (a.slot - b.slot) || (a.order - b.order));
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
      if (this.models.every((model) => this.keys.every((key) => this.state.get(`${model}\u0000${key}`).daily >= GEMINI_REQUESTS_PER_DAY))) throw new Error("Every configured Gemini model and key has reached its daily request limit");
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
          sport_key: { type: "string" },
          website_url: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          state_name: { type: "string" },
          zip: { type: "string" },
          country: { type: "string" },
          address: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          geo_precision: {
            type: "string",
            enum: ["address", "zip", "city", "state"]
          },
          description: { type: "string" },
          cost_note: { type: "string" },
          equipment_provided: { type: "boolean" },
          ages: { type: "string" },
          seasons: {
            type: "array",
            items: { type: "string", enum: ["spring", "summer", "fall", "winter"] },
          },
          usual_month: { type: "integer", minimum: 1, maximum: 12 },
          first_year: { type: "integer", minimum: 1950, maximum: new Date().getFullYear() },
        },
        additionalProperties: false,
      },
      evidence: {
        type: "object",
        additionalProperties: {
          type: "array",
          items: { type: "string" }
        }
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

export async function fillMissing(pool, row, missing, sportRows, pages) {
  if (!missing.length || !pages.length) return {};
  const context = sourceText(pages);
  const requestedFields = missing.map((field) => field === "seasons_json" ? "seasons" : field);
  const prompt = `Use only the supplied website Markdown to fill explicitly requested missing fields for this adaptive-sports program. Do not infer, estimate, or make facts up. Return only supported fields, and provide the exact source URL for every returned field. Preserve unknown fields as absent. Only provide program details that the source identifies as belonging to this program.\n\nProgram: ${JSON.stringify({ name: row.name, sport: row.sport, website_url: row.website_url, city: row.city, state: row.state, zip: row.zip, address: row.address, description: row.description, organization_name: row.organization_name, organization_website_url: row.organization_website_url })}\nMissing fields requested: ${JSON.stringify(requestedFields)}\nAllowed sport keys: ${JSON.stringify(sportRows)}\n\nWebsite Markdown:${context.markdown}`;
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
          responseJsonSchema: schema()
        }
      });
      const parsed = JSON.parse(response.text || "{}");
      const fields = { ...(parsed?.fields || {}) };
      if (Array.isArray(fields.seasons)) {
        fields.seasons_json = JSON.stringify([...new Set(fields.seasons)].filter((season) => ["spring", "summer", "fall", "winter"].includes(season)));
        delete fields.seasons;
      }
      if (typeof fields.equipment_provided === "boolean") {
        fields.equipment_provided = fields.equipment_provided ? 1 : 0;
      }
      return Object.fromEntries(Object.entries(fields).filter(([field]) => missing.includes(field) && Array.isArray(parsed?.evidence?.[field === "seasons_json" ? "seasons" : field]) && parsed.evidence[field === "seasons_json" ? "seasons" : field].some((url) => context.includedUrls.has(url))));
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

export function normalizePatch(fields, sportRows) {
  const sportKeys = new Set(sportRows.map((sport) => sport.sport_key));
  const patch = {};
  if (sportKeys.has(fields.sport_key)) patch.sport_key = fields.sport_key;
  const matchingSport = sportRows.find((sport) => sport.sport_key === fields.sport_key);
  if (matchingSport?.name) patch.sport = matchingSport.name;
  if (matchingSport?.sport_key) patch.sports_json = JSON.stringify([matchingSport.sport_key]);
  if (/^https?:\/\/[^\s]+$/i.test(fields.website_url || "")) patch.website_url = fields.website_url.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email || "")) patch.email = fields.email.trim().toLowerCase();
  if (/^[+()\d.\-\s]{7,32}$/.test(fields.phone || "")) patch.phone = fields.phone.trim();
  if ((typeof fields.city === "string") && fields.city.trim()) patch.city = fields.city.trim();
  const rawState = String(fields.state || "").trim();
  const state = STATE_NAMES[rawState.toUpperCase()] ? rawState.toUpperCase() : states.get(rawState.toLowerCase());
  if (state) { patch.state = state; patch.state_name = STATE_NAMES[state]; }
  if (/^\d{5}(?:-\d{4})?$/.test(String(fields.zip || ""))) patch.zip = String(fields.zip);
  if ((typeof fields.country === "string") && fields.country.trim()) patch.country = fields.country.trim().slice(0, 80);
  if ((typeof fields.address === "string") && fields.address.trim()) patch.address = fields.address.trim();
  if (Number.isFinite(fields.lat) && (fields.lat >= -90) && (fields.lat <= 90)) patch.lat = fields.lat;
  if (Number.isFinite(fields.lng) && (fields.lng >= -180) && (fields.lng <= 180)) patch.lng = fields.lng;
  if (["address", "zip", "city", "state"].includes(fields.geo_precision)) patch.geo_precision = fields.geo_precision;
  if ((typeof fields.description === "string") && (fields.description.trim().length >= 20) && (fields.description.trim().length <= 1000)) patch.description = fields.description.trim();
  if ((typeof fields.cost_note === "string") && fields.cost_note.trim()) patch.cost_note = fields.cost_note.trim().slice(0, 500);
  if ([0, 1].includes(fields.equipment_provided)) patch.equipment_provided = fields.equipment_provided;
  if ((typeof fields.ages === "string") && fields.ages.trim()) patch.ages = fields.ages.trim().slice(0, 120);
  if (typeof fields.seasons_json === "string") {
    try {
      const seasons = JSON.parse(fields.seasons_json);
      const validSeasons = [...new Set(seasons)].filter((season) => ["spring", "summer", "fall", "winter"].includes(season));
      if (validSeasons.length) patch.seasons_json = JSON.stringify(validSeasons);
    } catch {}
  }
  if (Number.isInteger(fields.usual_month) && fields.usual_month >= 1 && fields.usual_month <= 12) patch.usual_month = fields.usual_month;
  if (Number.isInteger(fields.first_year) && fields.first_year >= 1950 && fields.first_year <= new Date().getFullYear()) patch.first_year = fields.first_year;
  return Object.fromEntries(Object.entries(patch).filter(([field]) => FILLABLE_FIELDS.includes(field)));
}
