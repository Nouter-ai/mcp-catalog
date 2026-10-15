import assert from "node:assert/strict";
import test from "node:test";
import { changedIds, probeable } from "./validate.ts";

test("changedIds toma solo las entradas tocadas", () => {
  assert.deepEqual(changedIds(["servers/notion.json", "servers/order.json", "logos/notion.svg", "README.md", "servers/stripe.json"]),
    ["notion", "stripe"]);
});

test("una entrada con hueco no se prueba: no hay un host de ejemplo que resuelva", () => {
  assert.equal(probeable({ url: "https://mcp.notion.com/mcp" }), true);
  assert.equal(probeable({ url: "https://{accountId}.suitetalk.api.netsuite.com/services/mcp/v1/all" }), false);
});
