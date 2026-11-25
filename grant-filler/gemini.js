import { GoogleGenAI } from "@google/genai";
import { isIP } from "node:net";
import { FILLABLE_FIELDS, GEMINI_MODELS, GEMINI_REQUESTS_PER_DAY, GEMINI_REQUESTS_PER_MINUTE, GRANT_AUDIENCES, GRANT_TYPES, MAX_MARKDOWN_CHARS } from "./config.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
    if (!this.keys.length) throw new Error("Set GEMINI_API_KEY before running grant-filler");

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

function schema(sportRows) {
  return {
    type: "object",
    properties: {
      fields: {
        type: "object",
        properties: {
          source: { type: "string" },
          type: { type: "string", enum: GRANT_TYPES },
          audience: { type: "string", enum: GRANT_AUDIENCES },
          amount_min_cents: { type: "integer" },
          amount_max_cents: { type: "integer" },
          amount_display: { type: "string" },
          deadline_display: { type: "string" },
          deadline_next: { type: "string" },
          description: { type: "string" },
          eligibility_criteria: { type: "string" },
          how_to_apply: { type: "string" },
          application_url: { type: "string" },
          source_url: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          sports_json: { type: "array", items: { type: "string", enum: sportRows.map((sport) => sport.sport_key) } },
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

export async function fillMissing(pool, grant, missing, sportRows, pages) {
  if (!missing.length || !pages.length) return {};

  const context = sourceText(pages);
  const prompt = `Use only the supplied website Markdown to fill explicitly requested empty details for this grant opportunity. Preserve unknown values as absent; do not infer eligibility, award amounts, deadlines, or whether applications are open. Return only facts supported by the source and include the exact source URL as evidence for every returned field. Return amount fields as integer cents, deadline_next as YYYY-MM-DD, sports_json as an array of allowed sport_key strings, and only use the listed grant type and audience values. Do not return or change grant name, ID, open or renewable flags, visibility, status, or timestamps.\n\nGrant: ${JSON.stringify({ name: grant.name, source: grant.source, type: grant.type, audience: grant.audience, amount_min_cents: grant.amount_min_cents, amount_max_cents: grant.amount_max_cents, amount_display: grant.amount_display, deadline_display: grant.deadline_display, deadline_next: grant.deadline_next, description: grant.description, eligibility_criteria: grant.eligibility_criteria, how_to_apply: grant.how_to_apply, application_url: grant.application_url, source_url: grant.source_url, sports_json: grant.sports_json })}\nMissing fields requested: ${JSON.stringify(missing)}\nAllowed grant types: ${JSON.stringify(GRANT_TYPES)}\nAllowed audiences: ${JSON.stringify(GRANT_AUDIENCES)}\nAllowed sports: ${JSON.stringify(sportRows)}\n\nWebsite Markdown:${context.markdown}`;

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
          responseJsonSchema: schema(sportRows),
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

function nonnegativeInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = (typeof value === "number") ? value : Number(String(value || "").replaceAll(",", ""));
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function publicUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (!(["http:", "https:"].includes(url.protocol)) || !url.hostname.includes(".")) return null;
    if (isIP(url.hostname) || url.hostname.toLowerCase().endsWith(".local")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function textValue(value, limit) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

export function normalizePatch(fields, sportRows, grant = {}) {
  const sportKeys = new Set(sportRows.map((sport) => sport.sport_key));
  const patch = {};

  for (const field of ["source", "amount_display", "deadline_display", "description", "eligibility_criteria", "how_to_apply", "phone"]) {
    const value = textValue(fields[field], field === "description" || field === "eligibility_criteria" || field === "how_to_apply" ? 5000 : 500);
    if (value) patch[field] = value;
  }
  if (GRANT_TYPES.includes(fields.type)) patch.type = fields.type;
  if (GRANT_AUDIENCES.includes(fields.audience)) patch.audience = fields.audience;

  const minimum = nonnegativeInteger(fields.amount_min_cents);
  const maximum = nonnegativeInteger(fields.amount_max_cents);
  if (minimum !== null) patch.amount_min_cents = minimum;
  if (maximum !== null) patch.amount_max_cents = maximum;
  const effectiveMinimum = patch.amount_min_cents ?? grant.amount_min_cents;
  const effectiveMaximum = patch.amount_max_cents ?? grant.amount_max_cents;
  if (effectiveMinimum != null && effectiveMaximum != null && Number(effectiveMinimum) > Number(effectiveMaximum)) {
    if (patch.amount_min_cents !== undefined) delete patch.amount_min_cents;
    if (patch.amount_max_cents !== undefined) delete patch.amount_max_cents;
  }

  const deadline = dateOnly(fields.deadline_next);
  if (deadline) patch.deadline_next = deadline;
  for (const field of ["application_url", "source_url"]) {
    const url = publicUrl(fields[field]);
    if (url) patch[field] = url;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email || "")) patch.email = fields.email.trim().toLowerCase();
  if (Array.isArray(fields.sports_json)) {
    const sports = [...new Set(fields.sports_json.filter((key) => sportKeys.has(key)))];
    if (sports.length) patch.sports_json = JSON.stringify(sports);
  }

  return Object.fromEntries(Object.entries(patch).filter(([field]) => FILLABLE_FIELDS.includes(field)));
}
