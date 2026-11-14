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

if (applicationRun && !existsSync(environmentPath)) throw new Error(`Missing ${ENVIRONMENT_FILE}. Copy the matching example file and configure its secrets before running org-filler.`);
if (applicationRun && !existsSync(wranglerPath)) throw new Error(`Missing ${WRANGLER_CONFIG}. org-filler cannot select its D1 target.`);
if (existsSync(environmentPath)) loadEnvironment({ path: environmentPath, override: false, quiet: true });
if (process.env.DATABASE_NAME && process.env.DATABASE_NAME !== DATABASE_NAME) throw new Error(`${ENVIRONMENT_FILE} targets ${process.env.DATABASE_NAME}, but this run requires ${DATABASE_NAME}.`);
export const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
export const FILLABLE_FIELDS = [
  "sport_key",
  "website_url",
  "email",
  "phone",
  "city",
  "state",
  "state_name",
  "zip",
  "address",
  "lat",
  "lng",
  "geo_precision",
  "description",
];
export const MAX_SITE_PAGES = Number(process.env.MAX_SITE_PAGES || 20);
export const MAX_MARKDOWN_CHARS = Number(process.env.MAX_MARKDOWN_CHARS || 100000);
export const SITE_REQUEST_INTERVAL_MS = Number(process.env.SITE_REQUEST_INTERVAL_MS || 1000);
export const SEARCH_INTERVAL_MS = Number(process.env.SEARCH_INTERVAL_MS || 5000);
export const GEMINI_REQUESTS_PER_MINUTE = Number(process.env.GEMINI_REQUESTS_PER_MINUTE || 10);
export const GEMINI_REQUESTS_PER_DAY = Number(process.env.GEMINI_REQUESTS_PER_DAY || 500);
export const STATE_NAMES = Object.freeze({
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
});
