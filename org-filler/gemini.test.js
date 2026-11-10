import test from "node:test";
import assert from "node:assert/strict";
import { batchOrganizations, normalizeResearch } from "./gemini.js";

test("normalization accepts only supported values", () => {
  const result = normalizeResearch({ sport_key: "basketball", website_url: "https://example.org", email: "INFO@example.org", phone: "+1 555 555 1212", city: "Troy", state: "ny", zip: "12180", address: "1 Main St", geo_precision: "address", description: "An adaptive sports program for people with disabilities." }, [{ sport_key: "basketball" }]);
  assert.equal(result.state, "NY");
  assert.equal(result.state_name, "New York");
  assert.equal(result.email, "info@example.org");
});

test("normalization drops unknown sport keys and malformed contact details", () => {
  const result = normalizeResearch({ sport_key: "unknown", email: "not-an-email", phone: "letters", zip: "wrong" }, [{ sport_key: "basketball" }]);
  assert.deepEqual(result, {});
});

test("batches keep every organization and respect a constrained estimate", () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({ id: String(index), name: `Organization ${index}`, description: "x".repeat(10_000) }));
  const batches = batchOrganizations(rows, [{ sport_key: "basketball", name: "Basketball" }]);
  assert.deepEqual(batches.flat().map((row) => row.id), Array.from({ length: 15 }, (_, index) => String(index)));
  assert.ok(batches.length > 1);
});