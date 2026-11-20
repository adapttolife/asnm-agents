import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("./data/us-areas.json", import.meta.url));

export async function loadAreas() {
  const areas = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(areas.states) || !Array.isArray(areas.counties) || !Array.isArray(areas.cities)) throw new Error("data/us-areas.json is invalid. Run npm run seed:areas.");
  return areas;
}

export function pickArea(areas, random = Math.random) {
  const kinds = ["county", "city", "state"];
  const collections = {
    county: areas.counties,
    city: areas.cities,
    state: areas.states
  };
  const kind = kinds[Math.floor(random() * kinds.length)];
  const values = collections[kind];
  return { kind, ...values[Math.floor(random() * values.length)] };
}
