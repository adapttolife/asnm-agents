import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { internalLinks, pageToMarkdown } from "./markdown.js";
import { normalizePatch } from "./gemini.js";
import { missingFields } from "./normalize.js";
import { createStatistics } from "./statistics.js";
import { createLogger } from "./logger.js";
import { browserExecutableCandidates } from "./browser.js";
import { crawlSite } from "./crawler.js";
import { FILL_ELIGIBILITY } from "./database.js";
import { FILLABLE_FIELDS, geminiModels, searchEngines } from "./config.js";
import { GeminiPool } from "./gemini.js";

test("converts readable content to Markdown and removes navigation", () => {
  const page = pageToMarkdown(
    "<html><head><title>Example</title></head><body><nav>Ignore</nav><main><h1>Heading</h1><p>Useful <strong>content</strong>.</p></main></body></html>",
    "https://example.org/",
  );
  assert.equal(page.title, "Example");
  assert.match(page.markdown, /Heading/);
  assert.match(page.markdown, /Useful \*\*content\*\*/);
  assert.doesNotMatch(page.markdown, /Ignore/);
});

test("keeps only same-origin crawlable links", () => {
  const links = internalLinks(
    "<a href='/about'>About</a><a href='https://other.example/x'>Other</a><a href='/image.png'>Image</a>",
    "https://example.org/",
    "https://example.org",
  );
  assert.deepEqual(links, ["https://example.org/about"]);
});

test("event filler targets only empty event detail fields", () => {
  assert.equal(FILL_ELIGIBILITY, "1 = 1");
  assert.deepEqual(FILLABLE_FIELDS, [
    "description",
    "sport_key",
    "venue",
    "city",
    "state",
    "url",
    "starts_at",
    "ends_at",
    "recap_url",
  ]);
});

test("normalizes event details without allowing relationship or visibility changes", () => {
  const patch = normalizePatch({
    description: "An adaptive sports tournament for local athletes.",
    sport_key: "basketball",
    venue: "RPI Field House",
    city: "Troy",
    state: "New York",
    url: "https://example.org/event",
    starts_at: "2026-12-01T18:00:00-05:00",
    ends_at: "2026-12-01T21:00:00-05:00",
    recap_url: "javascript:alert(1)",
    org_id: "untrusted-org",
    program_id: "untrusted-program",
    is_public: 1,
    status: "cancelled",
  }, [{ sport_key: "basketball", name: "Wheelchair Basketball" }]);

  assert.deepEqual(patch, {
    description: "An adaptive sports tournament for local athletes.",
    sport_key: "basketball",
    venue: "RPI Field House",
    city: "Troy",
    state: "NY",
    url: "https://example.org/event",
    starts_at: "2026-12-01T23:00:00.000Z",
    ends_at: "2026-12-02T02:00:00.000Z",
  });
});

test("rejects timestamps without explicit zones and preserves nonempty values", () => {
  const patch = normalizePatch({
    starts_at: "2026-12-01T18:00:00",
    ends_at: "2026-12-01",
    url: "//example.org/event",
  }, []);
  assert.deepEqual(patch, { ends_at: "2026-12-01T00:00:00.000Z" });
  assert.deepEqual(missingFields({ title: "Event", description: "  ", starts_at: null }), ["description", "starts_at"]);
});

test("persists per-run event statistics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "event-filler-statistics-"));
  try {
    const statistics = await createStatistics({ mode: "apply", environment: "staging", directory });
    await statistics.started({ id: "event-id", title: "Adaptive Sports Tournament" });
    await statistics.changed("Adaptive Sports Tournament");
    await statistics.skipped();
    const stored = JSON.parse(await readFile(statistics.file, "utf8"));
    assert.equal(stored.changed, 1);
    assert.equal(stored.skipped, 1);
    assert.deepEqual(stored.changedEvents, ["Adaptive Sports Tournament"]);
    assert.equal(stored.processing, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("writes each process logger to an event-specific timestamped file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "event-filler-logs-"));
  try {
    const logger = await createLogger(directory);
    await logger.info("Run started");
    assert.match(logger.file, /event-filler-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+\.log$/);
    assert.match(await readFile(logger.file, "utf8"), /INFO Run started/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("tries the configured Chromium executable before fallbacks", () => {
  assert.deepEqual(browserExecutableCandidates("/opt/chromium"), [
    "/opt/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ]);
});

test("reports crawler page progress", async () => {
  const originalFetch = globalThis.fetch;
  const progress = [];
  globalThis.fetch = async () => new Response("<main><p>Example</p></main>", {
    headers: { "content-type": "text/html" },
  });
  try {
    await assert.rejects(
      crawlSite("https://example.org/", { onProgress: async (message) => progress.push(message) }),
      /No readable HTML pages were found/,
    );
    assert.match(progress[0], /crawler fetching page 1\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parses multiple search engines", () => {
  assert.deepEqual(searchEngines("duckduckgo, bing,duckduckgo"), ["duckduckgo", "bing"]);
});

test("uses a backup model after the primary model reaches its daily quota", async () => {
  const pool = new GeminiPool({ keys: ["test-key"], models: ["primary", "backup"] });
  const primary = await pool.acquire();
  pool.rateLimited(primary, true);
  assert.equal((await pool.acquire()).model, "backup");
  assert.deepEqual(geminiModels("primary", "backup,primary"), ["primary", "backup"]);
});
