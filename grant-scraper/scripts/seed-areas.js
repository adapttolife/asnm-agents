import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../data/us-areas.json", import.meta.url));
const root = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer";
const stateCodes = Object.freeze({ "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY" });

async function gazetteer(kind, stateFips) {
  const response = await fetch(`${root}/2024_gaz_${kind}_${stateFips}.txt`);
  if (!response.ok) throw new Error(`Census Gazetteer returned HTTP ${response.status} for ${kind}/${stateFips}`);
  const [header, ...rows] = (await response.text()).trim().split(/\r?\n/).map((line) => line.split("\t"));
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
}

const states = Object.entries(stateCodes).map(([id, state]) => ({
  id,
  name: state,
  state
}));
const countyRows = await Promise.all(Object.keys(stateCodes).map(async (stateFips) => ({
  stateFips,
  rows: await gazetteer("counties", stateFips)
})));
const cityRows = await Promise.all(Object.keys(stateCodes).map(async (stateFips) => ({
  stateFips,
  rows: await gazetteer("place", stateFips)
})));
const counties = countyRows.flatMap(({ stateFips, rows }) => rows.map((row) => ({
  id: row.GEOID,
  name: row.NAME,
  state: stateCodes[stateFips],
  county: row.NAME
})));
const cities = cityRows.flatMap(({ stateFips, rows }) => rows.map((row) => ({
  id: row.GEOID,
  name: row.NAME,
  state: stateCodes[stateFips],
  city: row.NAME
})));

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify({
  source: "U.S. Census Bureau 2024 Gazetteer",
  generatedAt: new Date().toISOString(),
  states,
  counties,
  cities }, null, 2)}\n`);
console.log(`Wrote ${states.length} states, ${counties.length} counties, and ${cities.length} Census places to ${output}.`);
