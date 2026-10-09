import assert from "node:assert/strict";
import test from "node:test";
import { changedIds } from "./validate.ts";

test("changedIds toma solo las entradas tocadas", () => {
  assert.deepEqual(changedIds(["servers/notion.json", "servers/order.json", "logos/notion.svg", "README.md", "servers/stripe.json"]),
    ["notion", "stripe"]);
});
