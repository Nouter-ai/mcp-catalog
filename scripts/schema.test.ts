import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RESERVED } from "./entry.ts";

test("el esquema del editor nombra las mismas claves, reservados y variable que las reglas", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/entry.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(schema.properties).toSorted(),
    ["color", "description", "id", "landing", "name", "registry", "settings", "tagline", "trustedLogin", "url"]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.id.not.enum.toSorted(), [...RESERVED].toSorted());
  assert.equal(schema.properties.settings.items.properties.variable.const, "MCP_FIXED_CLIENT_ID");
});
