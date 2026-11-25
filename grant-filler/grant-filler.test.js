import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FILLABLE_FIELDS, GRANT_AUDIENCES, GRANT_TYPES } from "./config.js";
import { normalizePatch, GeminiPool } from "./gemini.js";
import { missingFields } from "./normalize.js";
import { createLogger } from "./logger.js";
import { createStatistics } from "./statistics.js";
import { searchQuery } from "./web-search.js";

const sports = [
  { sport_key: "basketball", name: "Basketball" },
  { sport_key: "tennis", name: "Tennis" },
];

test("grant filler allowlist matches fillable grant detail columns only", () => {
  assert.deepEqual(FILLABLE_FIELDS, [
    "source",
    "type",
    "audience",
    "amount_min_cents",
    "amount_max_cents",
    "amount_display",
    "deadline_display",
    "deadline_next",
    "description",
    "eligibility_criteria",
    "how_to_apply",
    "application_url",
    "source_url",
    "email",
    "phone",
    "sports_json",
  ]);
  assert.deepEqual(GRANT_TYPES, ["general", "equipment", "quality_of_life", "training", "program"]);
  assert.deepEqual(GRANT_AUDIENCES, ["athlete", "program"]);
  assert.deepEqual(missingFields({ description: " ", deadline_next: null, is_open: 1 }), ["description", "deadline_next"]);
});

test("normalizes evidence-derived grant fields and rejects invalid values", () => {
  const patch = normalizePatch({
    source: "Adaptive Sports Foundation",
    type: "equipment",
    audience: "athlete",
    amount_min_cents: "0",
    amount_max_cents: 125000,
    deadline_next: "2027-04-30",
    description: "Funding for adaptive equipment.",
    application_url: "https://example.org/apply",
    source_url: "javascript:alert(1)",
    email: "GRANTS@example.org",
    sports_json: ["basketball", "not-a-real-sport", "tennis"],
    is_open: 0,
    is_public: 1,
  }, sports);

  assert.deepEqual(patch, {
    source: "Adaptive Sports Foundation",
    type: "equipment",
    audience: "athlete",
    amount_min_cents: 0,
    amount_max_cents: 125000,
    deadline_next: "2027-04-30",
    description: "Funding for adaptive equipment.",
    application_url: "https://example.org/apply",
    email: "grants@example.org",
    sports_json: '["basketball","tennis"]',
  });
  assert.ok(Object.keys(patch).every((field) => FILLABLE_FIELDS.includes(field)));
});

test("rejects invalid dates, unsafe URLs, and inconsistent amounts", () => {
  const patch = normalizePatch({
    amount_min_cents: 5000,
    amount_max_cents: 1000,
    deadline_next: "2027-02-30",
    application_url: "//example.org/apply",
    audience: "organization",
    type: "unknown",
  }, sports);
  assert.deepEqual(patch, {});

  assert.deepEqual(normalizePatch({ amount_min_cents: 6000 }, sports, { amount_max_cents: 5000 }), {});
  assert.deepEqual(normalizePatch({ amount_max_cents: 5000 }, sports, { amount_min_cents: 10000 }), {});
});

test("searches for a grant using its name, source, type, and adaptive sports context", () => {
  const query = searchQuery({ name: "Equipment Award", source: "Example Foundation", type: "equipment", audience: "athlete" });
  assert.match(query, /Equipment Award/);
  assert.match(query, /Example Foundation/);
  assert.match(query, /adaptive sports disability/);
  assert.match(query, /equipment/);
});

test("persists grant filler statistics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grant-filler-statistics-"));
  try {
    const statistics = await createStatistics({ mode: "apply", environment: "staging", directory });
    await statistics.started({ id: "grant-id", name: "Adaptive Equipment Award" });
    await statistics.changed("Adaptive Equipment Award");
    await statistics.skipped();
    const stored = JSON.parse(await readFile(statistics.file, "utf8"));
    assert.equal(stored.changed, 1);
    assert.equal(stored.skipped, 1);
    assert.deepEqual(stored.changedGrants, ["Adaptive Equipment Award"]);
    assert.equal(stored.processing, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("writes grant-specific log files and rotates past a rate-limited model", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grant-filler-logs-"));
  try {
    const logger = await createLogger(directory);
    await logger.info("Run started");
    assert.match(logger.file, /grant-filler-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+\.log$/);
    assert.match(await readFile(logger.file, "utf8"), /INFO Run started/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const pool = new GeminiPool({ keys: ["test-key"], models: ["primary", "backup"] });
  const primary = await pool.acquire();
  pool.rateLimited(primary, true);
  assert.equal((await pool.acquire()).model, "backup");
});
