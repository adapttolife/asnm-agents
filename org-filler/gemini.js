import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL, FILLABLE_FIELDS, GEMINI_REQUESTS_PER_DAY, GEMINI_REQUESTS_PER_MINUTE, MAX_MARKDOWN_CHARS, STATE_NAMES } from "./config.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const states = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]));

function keys() {
  return [process.env.GEMINI_API_KEY, ...(process.env.GEMINI_API_KEYS || "").split(",")].map((key) => String(key || "").trim()).filter(Boolean);
}

function dateInPacific() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export class GeminiPool {
  constructor() {
    this.keys = keys();
    this.cursor = 0;
    this.state = new Map(this.keys.map((key) => [key, { requests: [], date: "", daily: 0, blockedUntil: 0 }]));
  }

  async acquire() {
    if (!this.keys.length) throw new Error("Set GEMINI_API_KEY before running org-filler");
    while (true) {
      const now = Date.now();
      const today = dateInPacific();
      const candidates = this.keys.map((key, index) => {
        const state = this.state.get(key);
        if (state.date !== today) Object.assign(state, {
          date: today,
          daily: 0,
          requests: []
        });
        state.requests = state.requests.filter((time) => time > (now - 60_000));
        if (state.daily >= GEMINI_REQUESTS_PER_DAY) return null;
        return {
          key,
          state,
          slot: Math.max(state.blockedUntil, (state.requests.length >= GEMINI_REQUESTS_PER_MINUTE) ? ((state.requests[0] || now) + 60_000) : now),
          order: (index - this.cursor + this.keys.length) % this.keys.length
        };
      }).filter(Boolean);
      if (!candidates.length) throw new Error("Every configured Gemini key has reached its daily request limit");
      candidates.sort((a, b) => (a.slot - b.slot) || (a.order - b.order));
      const selected = candidates[0];
      if (selected.slot > now) {
        await wait(selected.slot - now);
        continue;
      }
      selected.state.requests.push(now);
      selected.state.daily++;
      this.cursor = (this.keys.indexOf(selected.key) + 1) % this.keys.length;
      return selected;
    }
  }

  rateLimited(key) {
    this.state.get(key).blockedUntil = Date.now() + 60_000;
  }
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
  for (let attempt = 0; attempt < pool.keys.length; attempt++) {
    const selected = await pool.acquire();
    try {
      const ai = new GoogleGenAI({ apiKey: selected.key });
      const response = await ai.models.generateContent({
        model: DEFAULT_MODEL,
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
        pool.rateLimited(selected.key);
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
