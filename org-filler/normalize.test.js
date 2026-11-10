import test from "node:test";
import assert from "node:assert/strict";
import { deterministicFields } from "./normalize.js";

test("matches sport labels without case or punctuation differences", () => {
  assert.deepEqual(
    deterministicFields({ sport: "Wheelchair Basketball", state: "ny" }, [
      { name: "Wheelchair-Basketball", sport_key: "wheelchair-basketball" }
    ]),
    { sport_key: "wheelchair-basketball", state_name: "New York" }
  );
});

test("does not replace present values or guess unknown sports", () => {
  assert.deepEqual(
    deterministicFields({ sport: "Unknown activity", sport_key: "existing", state: "NY", state_name: "New York" }, []),
    {}
  );
});