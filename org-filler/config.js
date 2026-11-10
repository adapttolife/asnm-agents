export const DATABASE_NAME = "asnm-db-staging";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const MAX_REQUESTS_PER_MINUTE = 15;
export const MAX_INPUT_TOKENS_PER_MINUTE = 250_000;
export const MAX_REQUESTS_PER_DAY = 500;
export const REQUEST_INTERVAL_MS = 60_000 / MAX_REQUESTS_PER_MINUTE;
export const MAX_BATCH_INPUT_TOKENS = 45_000;
export const MAX_BATCH_OUTPUT_TOKENS = 48_000;
export const FILLABLE_FIELDS = [
  "sport_key", "website_url", "email", "phone", "city", "state", "state_name",
  "zip", "address", "lat", "lng", "geo_precision", "description",
];
export const STATE_NAMES = Object.freeze({
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
});