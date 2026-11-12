import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RESERVED } from "./entry.ts";
import { NS } from "./server-json.ts";

test("el esquema del editor es el del estándar más lo de Nouter, con las mismas claves, reservados y variables que las reglas", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/entry.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(schema.allOf, [{ $ref: "vendor/server.schema.json" }]);
  const meta = schema.properties._meta.properties[NS];
  assert.equal(meta.additionalProperties, false);
  assert.deepEqual(Object.keys(meta.properties).toSorted(), ["color", "description", "id", "landing", "settings", "trustedLogin"]);
  assert.deepEqual(meta.properties.id.not.enum.toSorted(), [...RESERVED].toSorted());
  assert.deepEqual(meta.properties.settings.items.oneOf.map((f: any) => f.properties.variable?.const ?? `fills:${f.properties.fills.const}`)
    .toSorted(), ["MCP_FIXED_CLIENT_ID", "MCP_FIXED_CLIENT_SECRET", "fills:url"]);
  assert.equal(meta.properties.trustedLogin.items.pattern, "^https://");
  assert.equal(schema.properties.description.maxLength, 60);
});
