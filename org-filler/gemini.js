import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL, FILLABLE_FIELDS, MAX_BATCH_INPUT_TOKENS, MAX_BATCH_OUTPUT_TOKENS, MAX_INPUT_TOKENS_PER_MINUTE, MAX_REQUESTS_PER_DAY, MAX_REQUESTS_PER_MINUTE, REQUEST_INTERVAL_MS, STATE_NAMES } from "./config.js";

const projectStates = new Map();
let keyIndex = 0;

function pacificDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function estimateInputTokens(text) {
  return Math.ceil(String(text).length / 3);
}

function keys() {
  return [process.env.GEMINI_API_KEY, ...(process.env.GEMINI_API_KEYS || "").split(",")].map((key) => String(key || "").trim()).filter(Boolean);
}

export function configuredKeyCount() {
  return keys().length;
}

function stateFor(key) {
  if (!projectStates.has(key)) projectStates.set(key, { nextRequestAt: 0, recentRequests: [], dailyRequestCount: 0, quotaDate: "" });
  return projectStates.get(key);
}

function earliestSlot(state, inputTokens, now) {
  state.recentRequests = state.recentRequests.filter((request) => request.at > now - 60_000);
  const inputTokensUsed = state.recentRequests.reduce((total, request) => total + request.inputTokens, 0);
  let slot = Math.max(now, state.nextRequestAt);
  if (state.recentRequests.length >= MAX_REQUESTS_PER_MINUTE) slot = Math.max(slot, state.recentRequests[0].at + 60_000);
  let tokensToRelease = inputTokensUsed + inputTokens - MAX_INPUT_TOKENS_PER_MINUTE;
  for (const request of state.recentRequests) {
    if (tokensToRelease <= 0) break;
    tokensToRelease -= request.inputTokens;
    slot = Math.max(slot, request.at + 60_000);
  }
  return slot;
}

async function reserveProject(inputTokens) {
  const available = keys();
  if (!available.length) throw new Error("Set GEMINI_API_KEY before running org-filler");
  while (true) {
    const now = Date.now();
    const today = pacificDate();
    const candidates = available.flatMap((key, index) => {
      const state = stateFor(key);
      if (state.quotaDate !== today) {
        state.quotaDate = today;
        state.dailyRequestCount = 0;
      }
      if (state.dailyRequestCount >= MAX_REQUESTS_PER_DAY) return [];
      return [{ key, state, slot: earliestSlot(state, inputTokens, now), order: (index - keyIndex + available.length) % available.length }];
    });
    if (!candidates.length) throw new Error(`Gemini daily request limit of ${MAX_REQUESTS_PER_DAY} reached for every configured project; resume after midnight Pacific time.`);
    candidates.sort((a, b) => a.slot - b.slot || a.order - b.order);
    const selected = candidates[0];
    if (selected.slot > now) {
      await new Promise((resolve) => setTimeout(resolve, selected.slot - now));
      continue;
    }
    selected.state.recentRequests.push({ at: now, inputTokens });
    selected.state.nextRequestAt = now + REQUEST_INTERVAL_MS;
    selected.state.dailyRequestCount++;
    keyIndex = (available.indexOf(selected.key) + 1) % available.length;
    return selected.key;
  }
}

function parseJson(text) {
  const source = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(source);
}

function researchRow(row) {
  return { id: row.id, name: row.name, sport: row.sport, website_url: row.website_url, city: row.city, state: row.state, state_name: row.state_name, zip: row.zip, address: row.address, description: row.description, sources: row.sources || [] };
}

export function researchPrompt(rows, sportOptions) {
  return `Research each listed US adaptive-sports organization from the supplied Searlo search sources only. Return JSON only. Do not infer, estimate, or fabricate. Include a field only when a supplied source explicitly supports it. Every returned field must include the exact supporting source URL. Do not return personal contact details. Preserve each input id exactly.\n\nOrganizations and sources: ${JSON.stringify(rows.map(researchRow))}\n\nAllowed sport keys: ${JSON.stringify(sportOptions)}\n\nJSON shape: {"organizations":[{"id":string,"fields":{"sport_key":string,"website_url":string,"email":string,"phone":string,"city":string,"state":string,"state_name":string,"zip":string,"address":string,"geo_precision":"address"|"city"|"state","description":string},"evidence":{"fieldName":["https://..."]}}]}. Include one object for every input organization, with empty fields and evidence when nothing is confirmed.`;
}

export function batchOrganizations(rows, sportOptions) {
  const batches = [];
  let batch = [];
  for (const row of rows) {
    const candidate = [...batch, row];
    if (batch.length && estimateInputTokens(researchPrompt(candidate, sportOptions)) > MAX_BATCH_INPUT_TOKENS) {
      batches.push(batch);
      batch = [row];
    } else {
      batch = candidate;
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function researchOrganizations(rows, sportOptions, model = DEFAULT_MODEL) {
  const prompt = researchPrompt(rows, sportOptions);
  const key = await reserveProject(estimateInputTokens(prompt));
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({ model, contents: prompt, config: { temperature: 0, maxOutputTokens: MAX_BATCH_OUTPUT_TOKENS } });
  const result = parseJson(response.text);
  const allowedIds = new Set(rows.map((row) => row.id));
  const sourceUrls = new Set(rows.flatMap((row) => row.sources || []).map((source) => source.url));
  const items = Array.isArray(result?.organizations) ? result.organizations : [];
  return new Map(items.filter((item) => allowedIds.has(item?.id)).map((item) => [item.id, Object.fromEntries(Object.entries(item?.fields || {}).filter(([field]) => Array.isArray(item?.evidence?.[field]) && item.evidence[field].some((url) => sourceUrls.has(url))))]));
}

export function normalizeResearch(fields, sportRows) {
  const out = {};
  const sportKeys = new Set(sportRows.map((sport) => sport.sport_key));
  if (sportKeys.has(fields.sport_key)) out.sport_key = fields.sport_key;
  if (/^https?:\/\/[^\s]+$/i.test(fields.website_url || "")) out.website_url = fields.website_url;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email || "")) out.email = fields.email.toLowerCase();
  if (/^[+()\d.\-\s]{7,32}$/.test(fields.phone || "")) out.phone = fields.phone.trim();
  if (typeof fields.city === "string" && fields.city.trim()) out.city = fields.city.trim();
  const state = String(fields.state || "").trim().toUpperCase();
  if (STATE_NAMES[state]) { out.state = state; out.state_name = STATE_NAMES[state]; }
  if (/^\d{5}(?:-\d{4})?$/.test(String(fields.zip || ""))) out.zip = String(fields.zip);
  if (typeof fields.address === "string" && fields.address.trim()) out.address = fields.address.trim();
  if (["address", "city", "state"].includes(fields.geo_precision)) out.geo_precision = fields.geo_precision;
  if (typeof fields.description === "string" && fields.description.trim().length >= 20 && fields.description.trim().length <= 600) out.description = fields.description.trim();
  return Object.fromEntries(Object.entries(out).filter(([field]) => FILLABLE_FIELDS.includes(field)));
}
