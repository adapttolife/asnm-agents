import test from "node:test";
import assert from "node:assert/strict";
import { newOrganizations, searchQuery } from "./discovery.js";

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
