import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("./data/us-areas.json", import.meta.url));

export async function loadAreas() {
  const areas = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(areas.states) || !Array.isArray(areas.counties) || !Array.isArray(areas.cities)) throw new Error("data/us-areas.json is invalid. Run npm run seed:areas.");
  return areas;
}

export function pickArea(areas) {
  const kinds = ["county", "city", "state"];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const values = areas[`${kind}s`];
  return { kind, ...values[Math.floor(Math.random() * values.length)] };
}
