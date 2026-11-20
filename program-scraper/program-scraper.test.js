import test from "node:test";
import assert from "node:assert/strict";
import { newOrganizationPrograms, newPrograms, organizationProgramSearchQuery, searchQuery } from "./discovery.js";
import { pickArea } from "./areas.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStatistics } from "./statistics.js";

test("discards existing and duplicate program search candidates", () => {
  const candidates = newPrograms([
    { title: "Example Adaptive Program - Home", url: "https://example.org/" },
    { title: "Example Adaptive Program | Programs", url: "https://example.org/" },
    { title: "New Sports Program - Home", url: "https://new.example/" }
  ], [{ name: "Example Adaptive Program", website_url: "https://old.example/" }]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "New Sports Program");
  assert.equal(candidates[0].website_url, "https://new.example/");
});

test("searches with the sport and selected area", () => {
  assert.equal(searchQuery({ name: "Wheelchair Basketball" }, { name: "Albany County", state: "NY" }), "adaptive Wheelchair Basketball programs in Albany County, NY");
});

test("finds new programs on a known organization's website", () => {
  const organization = {
    id: "org-1",
    name: "Adaptive Sports Center",
    sport: "Multi-Sport",
    website_url: "https://www.adaptivesports.org/",
    city: "Crested Butte",
    state: "CO",
  };
  const candidates = newOrganizationPrograms([
    { title: "Adaptive Sports Center Youth Ski Program", url: "https://adaptivesports.org/programs/youth-ski" },
    { title: "Unrelated Adaptive Program", url: "https://other.example/program" },
  ], [], organization);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "Adaptive Sports Center Youth Ski Program");
  assert.match(organizationProgramSearchQuery(organization), /site:www\.adaptivesports\.org/);
});

test("requires organization name evidence when no organization website is known", () => {
  const organization = { id: "org-2", name: "Capital Adaptive Sports", sport: "Tennis", state: "NY" };
  const candidates = newOrganizationPrograms([
    { title: "Community Tennis Program", url: "https://program.example/tennis", description: "Programs for local athletes" },
    { title: "Other Tennis Program", url: "https://other.example/tennis", description: "Capital Adaptive Sports hosts this program" },
  ], [], organization);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "Other Tennis Program");
});

test("picks counties, cities, and states from their catalog collections", () => {
  const areas = { counties: [{ id: "county" }], cities: [{ id: "city" }], states: [{ id: "state" }] };
  assert.deepEqual(pickArea(areas, () => 0), { kind: "county", id: "county" });
  assert.deepEqual(pickArea(areas, () => 0.34), { kind: "city", id: "city" });
  assert.deepEqual(pickArea(areas, () => 0.67), { kind: "state", id: "state" });
});

test("persists per-process pair statistics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "program-scraper-statistics-"));
  try {
    const statistics = await createStatistics({ mode: "apply", environment: "staging", directory });
    const pair = { sport: "Tennis", areaKind: "city", area: "Troy", state: "NY" };
    await statistics.started(pair);
    await statistics.completed(pair, 2);
    const organization = { id: "org-1", name: "Adaptive Sports Center" };
    await statistics.organizationProgramStarted(organization);
    await statistics.organizationProgramCompleted(organization, 3);
    const stored = JSON.parse(await readFile(statistics.file, "utf8"));
    assert.equal(stored.pairsCompleted, 1);
    assert.equal(stored.organizationProgramRuns, 1);
    assert.equal(stored.programsQueued, 5);
    assert.deepEqual(stored.processedPairs, [pair, {
      type: "organization_program_discovery",
      organizationId: "org-1",
      organizationName: "Adaptive Sports Center",
      programsQueued: 3,
    }]);
    assert.equal(stored.processing, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
