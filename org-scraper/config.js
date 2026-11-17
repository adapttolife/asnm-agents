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

if (applicationRun && !existsSync(environmentPath)) throw new Error(`Missing ${ENVIRONMENT_FILE}.`);
if (applicationRun && !existsSync(wranglerPath)) throw new Error(`Missing ${WRANGLER_CONFIG}.`);
if (existsSync(environmentPath)) loadEnvironment({ path: environmentPath, override: false, quiet: true });
if (process.env.DATABASE_NAME && process.env.DATABASE_NAME !== DATABASE_NAME) throw new Error(`${ENVIRONMENT_FILE} targets the wrong D1 database.`);

const positive = (value, fallback, minimum = 1) => Math.max(minimum, Number(value) || fallback);
export const SEARCH_INTERVAL_MS = positive(process.env.SEARCH_INTERVAL_MS, 5_000);
export const RUN_INTERVAL_MS = positive(process.env.RUN_INTERVAL_MS, 3_600_000, 60_000);
export const PAIR_LOCK_MS = positive(process.env.PAIR_LOCK_MS, 1_800_000, 60_000);
export const MAX_PAIR_ATTEMPTS = positive(process.env.MAX_PAIR_ATTEMPTS, 100);
export const DISCOVERY_RESULT_LIMIT = positive(process.env.DISCOVERY_RESULT_LIMIT, 10);
export const SEARCH_ENGINES = [...new Set((process.env.OPEN_WEBSEARCH_ENGINES || "duckduckgo,bing").split(",").map((value) => value.trim()).filter(Boolean))];
export const AREA_REFRESH_DAYS = Object.freeze({ county: 91, city: 183, state: 30 });
