import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickArea } from "./areas.js";
import { areaSearchQuery, entitySearchQuery, newAreaEvents, newEntityEvents } from "./discovery.js";
import { createStatistics } from "./statistics.js";

test("area discovery accepts dated events and ignores undated results", () => {
  const events = newAreaEvents([
    {
      title: "Adaptive Tennis Open",
      url: "https://example.org/events/tennis-open",
      description: "Join us April 15, 2027 in Albany.",
    },
    {
      title: "Adaptive Sports Calendar",
      url: "https://example.org/calendar",
      description: "See upcoming competitions.",
    },
  ], []);

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Adaptive Tennis Open");
  assert.equal(events[0].starts_at, "2027-04-15T00:00:00.000Z");
  assert.equal(events[0].all_day, 1);
});

test("parses explicit ISO timestamps and filters existing events", () => {
  const event = {
    title: "Adaptive Basketball Tournament",
    url: "https://example.org/tournament",
    description: "Starts 2027-05-03T18:30:00-04:00.",
  };
  const parsed = newAreaEvents([event], []);
  assert.equal(parsed[0].starts_at, "2027-05-03T22:30:00.000Z");
  assert.equal(parsed[0].all_day, 0);
  assert.deepEqual(newAreaEvents([event], [{ title: parsed[0].title, url: parsed[0].url, starts_at: parsed[0].starts_at }]), []);
});

test("builds sport-area and linked-entity queries", () => {
  assert.match(areaSearchQuery({ name: "Wheelchair Basketball" }, { name: "Albany County", state: "NY" }, 2027), /events tournaments competitions Albany County, NY 2027/);

  const target = {
    entity_name: "Youth Ski Program",
    program_name: "Youth Ski Program",
    organization_name: "Adaptive Sports Center",
    sport_name: "Skiing",
    city: "Crested Butte",
    state: "CO",
  };
  const query = entitySearchQuery(target, 2027);
  assert.match(query, /Youth Ski Program/);
  assert.match(query, /Adaptive Sports Center/);
  assert.match(query, /2027/);
});

test("links entity-search events only when result evidence matches the entity", () => {
  const target = {
    entity_name: "Adaptive Sports Center",
    organization_name: "Adaptive Sports Center",
    website_url: "https://adaptivesports.org/",
  };
  const events = newEntityEvents([
    {
      title: "Adaptive Sports Center Winter Games",
      url: "https://tickets.example/event",
      description: "December 10, 2026 at the Adaptive Sports Center.",
    },
    {
      title: "Other Winter Games",
      url: "https://unrelated.example/event",
      description: "December 11, 2026.",
    },
  ], [], target);

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Adaptive Sports Center Winter Games");
});

test("picks counties, cities, and states from their catalog collections", () => {
  const areas = { counties: [{ id: "county" }], cities: [{ id: "city" }], states: [{ id: "state" }] };
  assert.deepEqual(pickArea(areas, () => 0), { kind: "county", id: "county" });
  assert.deepEqual(pickArea(areas, () => 0.34), { kind: "city", id: "city" });
  assert.deepEqual(pickArea(areas, () => 0.67), { kind: "state", id: "state" });
});

test("persists area and entity discovery statistics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "event-scraper-statistics-"));
  try {
    const statistics = await createStatistics({ mode: "apply", environment: "staging", directory });
    const area = { areaKind: "city", area: "Troy", state: "NY", sport: "Tennis" };
    const target = { entity_type: "program", entity_id: "program-id", entity_name: "Youth Tennis" };
    await statistics.areaStarted(area);
    await statistics.areaCompleted(area, 2);
    await statistics.entityStarted(target);
    await statistics.entityCompleted(target, 3);

    const stored = JSON.parse(await readFile(statistics.file, "utf8"));
    assert.equal(stored.areaPairsCompleted, 1);
    assert.equal(stored.entityDiscoveryRuns, 1);
    assert.equal(stored.eventsQueued, 5);
    assert.equal(stored.processing, null);
    assert.equal(stored.processedTargets.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
