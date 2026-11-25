import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnvironment } from "dotenv";

export const IS_PRODUCTION = process.argv.includes("--prod");
export const ENVIRONMENT_FILE = IS_PRODUCTION ? "prod.env" : ".env";
export const WRANGLER_CONFIG = IS_PRODUCTION ? "wrangler.prod.jsonc" : "wrangler.jsonc";
export const DATABASE_NAME = IS_PRODUCTION ? "asnm-db" : "asnm-db-staging";

const environmentPath = resolve(process.cwd(), ENVIRONMENT_FILE);
const wranglerPath = resolve(process.cwd(), WRANGLER_CONFIG);
const applicationRun = /(?:^|[\\/])index\.js$/.test(process.argv[1] || "");

if (applicationRun && !existsSync(environmentPath)) {
  throw new Error(`Missing ${ENVIRONMENT_FILE}. Copy the matching example file and configure its secrets before running grant-filler.`);
}
if (applicationRun && !existsSync(wranglerPath)) {
  throw new Error(`Missing ${WRANGLER_CONFIG}. grant-filler cannot select its D1 target.`);
}
if (existsSync(environmentPath)) loadEnvironment({ path: environmentPath, override: false, quiet: true });
if (process.env.DATABASE_NAME && process.env.DATABASE_NAME !== DATABASE_NAME) {
  throw new Error(`${ENVIRONMENT_FILE} targets ${process.env.DATABASE_NAME}, but this run requires ${DATABASE_NAME}.`);
}

export const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemma-4-26b-a4b-it";

export function geminiModels(primary = DEFAULT_MODEL, backups = process.env.GEMINI_BACKUP_MODELS || "") {
  return [...new Set([primary, ...String(backups).split(",")].map((model) => model.trim()).filter(Boolean))];
}

export const GEMINI_MODELS = geminiModels();
export const FILLABLE_FIELDS = [
  "source",
  "type",
  "audience",
  "amount_min_cents",
  "amount_max_cents",
  "amount_display",
  "deadline_display",
  "deadline_next",
  "description",
  "eligibility_criteria",
  "how_to_apply",
  "application_url",
  "source_url",
  "email",
  "phone",
  "sports_json",
];

export const MAX_SITE_PAGES = Number(process.env.MAX_SITE_PAGES || 20);
export const MAX_MARKDOWN_CHARS = Number(process.env.MAX_MARKDOWN_CHARS || 100000);
export const SITE_REQUEST_INTERVAL_MS = Number(process.env.SITE_REQUEST_INTERVAL_MS || 1000);
export const MAX_CRAWL_DURATION_MS = Math.max(1_000, Number(process.env.MAX_CRAWL_DURATION_MS) || 60_000);
export const SEARCH_INTERVAL_MS = Number(process.env.SEARCH_INTERVAL_MS || 5000);
export const OPEN_WEBSEARCH_ENGINES = [...new Set(
  String(process.env.OPEN_WEBSEARCH_ENGINES || process.env.OPEN_WEBSEARCH_ENGINE || "duckduckgo,bing")
    .split(",")
    .map((engine) => engine.trim())
    .filter(Boolean),
)];
export const GEMINI_REQUESTS_PER_MINUTE = Number(process.env.GEMINI_REQUESTS_PER_MINUTE || 10);
export const GEMINI_REQUESTS_PER_DAY = Number(process.env.GEMINI_REQUESTS_PER_DAY || 500);
export const RUN_INTERVAL_MS = Math.max(60_000, Number(process.env.RUN_INTERVAL_MS) || 3_600_000);
export const GRANT_TYPES = ["general", "equipment", "quality_of_life", "training", "program"];
export const GRANT_AUDIENCES = ["athlete", "program"];
