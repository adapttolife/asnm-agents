import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickArea } from "./areas.js";
import { areaSearchQuery, newGrants } from "./discovery.js";
import { insertGrantSql } from "./database.js";
import { createStatistics } from "./statistics.js";

test("grant discovery keeps public grant opportunities and ignores unrelated results", () => {
  const grants = newGrants([
    {
      title: "Adaptive Athlete Equipment Grant | Apply",
      url: "https://foundation.example.org/grants/equipment",
      description: "A grant supporting adaptive sports equipment.",
    },
    {
      title: "Grant Writing Workshop",
      url: "https://foundation.example.org/workshops",
      description: "Learn to write a grant proposal.",
    },
    {
      title: "Adaptive Sports Resource List",
      url: "https://foundation.example.org/resources",
      description: "A list of helpful resources.",
    },
    {
      title: "Adaptive Sports Award",
      url: "javascript:alert(1)",
      description: "An award for athletes.",
    },
  ]);

  assert.equal(grants.length, 1);
  assert.equal(grants[0].name, "Adaptive Athlete Equipment Grant");
  assert.equal(grants[0].source_url, "https://foundation.example.org/grants/equipment");
  assert.ok(grants[0].id);
  assert.deepEqual(Object.keys(grants[0]).sort(), ["id", "name", "source_url"]);
});

test("grant discovery deduplicates by normalized name and source URL", () => {
  const existing = [{ name: "Adaptive Athlete Grant", source_url: "https://example.org/old" }];
  const grants = newGrants([
    { title: "Adaptive Athlete Grant", url: "https://example.org/new", description: "Grant funding." },
    { title: "New Ski Scholarship", url: "https://example.org/old", description: "Scholarship award." },
    { title: "Wheelchair Tennis Funding Award", url: "https://example.org/tennis", description: "Grant award funding." },
  ], existing);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].name, "Wheelchair Tennis Funding Award");
});

test("builds adaptive grant queries using sport and area", () => {
  assert.equal(
    areaSearchQuery({ name: "Wheelchair Basketball" }, { name: "Albany County", state: "NY" }),
    "adaptive sports disability Wheelchair Basketball grant scholarship funding Albany County, NY",
  );
});

test("inserts only private, unlinked pending grant candidates with deduplication", () => {
  const sql = insertGrantSql({
    id: "grant-id",
    name: "Adaptive Athlete Grant",
    source_url: "https://example.org/grant",
  });
  assert.match(sql, /INSERT INTO grants \(id, name, source_url, audience, is_open, is_renewable, is_public, status/);
  assert.match(sql, /'athlete', 0, 0, 0, 'pending'/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM grants/);
  assert.doesNotMatch(sql, /org_id|program_id/);
});

test("picks counties, cities, and states from their catalog collections", () => {
  const areas = { counties: [{ id: "county" }], cities: [{ id: "city" }], states: [{ id: "state" }] };
  assert.deepEqual(pickArea(areas, () => 0), { kind: "county", id: "county" });
  assert.deepEqual(pickArea(areas, () => 0.34), { kind: "city", id: "city" });
  assert.deepEqual(pickArea(areas, () => 0.67), { kind: "state", id: "state" });
});

test("persists grant discovery statistics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grant-scraper-statistics-"));
  try {
    const statistics = await createStatistics({ mode: "dry-run", environment: "staging", directory });
    const area = { areaKind: "city", area: "Troy", state: "NY", sport: "Tennis" };
    await statistics.started(area);
    await statistics.completed(area, 2);

    const stored = JSON.parse(await readFile(statistics.file, "utf8"));
    assert.equal(stored.areaPairsCompleted, 1);
    assert.equal(stored.grantsQueued, 2);
    assert.equal(stored.processing, null);
    assert.equal(stored.processedAreas.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
