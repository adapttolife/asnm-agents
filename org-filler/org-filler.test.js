import test from "node:test";
import assert from "node:assert/strict";
import { internalLinks, pageToMarkdown } from "./markdown.js";
import { normalizePatch } from "./gemini.js";
import { deterministicPatch } from "./normalize.js";

test("converts readable content to Markdown and removes navigation", () => {
  const page = pageToMarkdown("<html><head><title>Example</title></head><body><nav>Ignore</nav><main><h1>Heading</h1><p>Useful <strong>content</strong>.</p></main></body></html>", "https://example.org/");
  assert.equal(page.title, "Example");
  assert.match(page.markdown, /Heading/);
  assert.match(page.markdown, /Useful \*\*content\*\*/);
  assert.doesNotMatch(page.markdown, /Ignore/);
});

test("keeps only same-origin crawlable links", () => {
  const links = internalLinks("<a href='/about'>About</a><a href='https://other.example/x'>Other</a><a href='/image.png'>Image</a>", "https://example.org/", "https://example.org");
  assert.deepEqual(links, ["https://example.org/about"]);
});

test("normalizes only allowed, valid organization fields", () => {
  const patch = normalizePatch({ state: "ny", zip: "12180", email: "INFO@example.org", lat: 42.7, lng: -73.6, description: "A sufficiently long verified adaptive sports organization description." }, [{ sport_key: "basketball", name: "Basketball" }]);
  assert.deepEqual(patch, { email: "info@example.org", state: "NY", state_name: "New York", zip: "12180", lat: 42.7, lng: -73.6, description: "A sufficiently long verified adaptive sports organization description." });
});

test("fills deterministic sport and state names without overwriting existing values", () => {
  const patch = deterministicPatch({ sport: "Wheelchair Basketball", sport_key: null, state: "CO", state_name: null }, [{ name: "Wheelchair Basketball", sport_key: "basketball" }]);
  assert.deepEqual(patch, { sport_key: "basketball", state_name: "Colorado" });
});
