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
    if (!this.keys.length) throw new Error("Set GEMINI_API_KEY before running org-filler");
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
          address: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          geo_precision: {
            type: "string",
            enum: ["address", "zip", "city", "state"]
          },
          description: { type: "string" },
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
  const prompt = `Use only the supplied website Markdown to fill the explicitly requested missing fields for this verified adaptive-sports organization. Do not infer, estimate, or make facts up. Return only supported fields, and provide the exact source URL for every returned field. Preserve unknown fields as absent.\n\nOrganization: ${JSON.stringify({ name: row.name, sport: row.sport, website_url: row.website_url, city: row.city, state: row.state, state_name: row.state_name, zip: row.zip, address: row.address })}\nMissing fields requested: ${JSON.stringify(missing)}\nAllowed sport keys: ${JSON.stringify(sportRows)}\n\nWebsite Markdown:${context.markdown}`;
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
      const fields = parsed?.fields || {};
      return Object.fromEntries(Object.entries(fields).filter(([field]) => missing.includes(field) && Array.isArray(parsed?.evidence?.[field]) && parsed.evidence[field].some((url) => context.includedUrls.has(url))));
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
  if (/^https?:\/\/[^\s]+$/i.test(fields.website_url || "")) patch.website_url = fields.website_url.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email || "")) patch.email = fields.email.trim().toLowerCase();
  if (/^[+()\d.\-\s]{7,32}$/.test(fields.phone || "")) patch.phone = fields.phone.trim();
  if ((typeof fields.city === "string") && fields.city.trim()) patch.city = fields.city.trim();
  const rawState = String(fields.state || "").trim();
  const state = STATE_NAMES[rawState.toUpperCase()] ? rawState.toUpperCase() : states.get(rawState.toLowerCase());
  if (state) { patch.state = state; patch.state_name = STATE_NAMES[state]; }
  if (/^\d{5}(?:-\d{4})?$/.test(String(fields.zip || ""))) patch.zip = String(fields.zip);
  if ((typeof fields.address === "string") && fields.address.trim()) patch.address = fields.address.trim();
  if (Number.isFinite(fields.lat) && (fields.lat >= -90) && (fields.lat <= 90)) patch.lat = fields.lat;
  if (Number.isFinite(fields.lng) && (fields.lng >= -180) && (fields.lng <= 180)) patch.lng = fields.lng;
  if (["address", "zip", "city", "state"].includes(fields.geo_precision)) patch.geo_precision = fields.geo_precision;
  if ((typeof fields.description === "string") && (fields.description.trim().length >= 20) && (fields.description.trim().length <= 1000)) patch.description = fields.description.trim();
  return Object.fromEntries(Object.entries(patch).filter(([field]) => FILLABLE_FIELDS.includes(field)));
}
