import test from "node:test";
import assert from "node:assert/strict";
import { newOrganizations, searchQuery } from "./discovery.js";
import { pickArea } from "./areas.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStatistics } from "./statistics.js";

test("discards existing and duplicate search candidates", () => {
  const candidates = newOrganizations([
    { title: "Example Adaptive Sports - Home", url: "https://example.org/" },
    { title: "Example Adaptive Sports | Programs", url: "https://example.org/" },
    { title: "New Sports Club - Home", url: "https://new.example/" }
  ], [{ name: "Example Adaptive Sports", website_url: "https://old.example/" }]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "New Sports Club");
  assert.equal(candidates[0].website_url, "https://new.example/");
});

test("searches with the sport and selected area", () => {
  assert.equal(searchQuery({ name: "Wheelchair Basketball" }, { name: "Albany County", state: "NY" }), "adaptive Wheelchair Basketball organizations in Albany County, NY");
});

test("picks counties, cities, and states from their catalog collections", () => {
  const areas = { counties: [{ id: "county" }], cities: [{ id: "city" }], states: [{ id: "state" }] };
  assert.deepEqual(pickArea(areas, () => 0), { kind: "county", id: "county" });
  assert.deepEqual(pickArea(areas, () => 0.34), { kind: "city", id: "city" });
  assert.deepEqual(pickArea(areas, () => 0.67), { kind: "state", id: "state" });
});

test("persists per-process pair statistics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "org-scraper-statistics-"));
  try {
    const statistics = await createStatistics({ mode: "apply", environment: "staging", directory });
    const pair = { sport: "Tennis", areaKind: "city", area: "Troy", state: "NY" };
    await statistics.started(pair);
    await statistics.completed(pair, 2);
    const stored = JSON.parse(await readFile(statistics.file, "utf8"));
    assert.equal(stored.pairsCompleted, 1);
    assert.equal(stored.organizationsQueued, 2);
    assert.deepEqual(stored.processedPairs, [pair]);
    assert.equal(stored.processing, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
