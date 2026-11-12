import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const load = async (p: string) => readFile(new URL(`../schema/vendor/${p}`, import.meta.url), "utf8");

test("el esquema del estándar está fijado, con el commit del que salió", async () => {
  const schema = JSON.parse(await load("server.schema.json"));
  const sd = (schema.$defs ?? schema.definitions).ServerDetail;
  assert.deepEqual(sd.required.toSorted(), ["description", "name", "version"]);
  assert.equal(sd.properties.description.maxLength, 100);
  assert.equal(sd.properties.name.pattern, "^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$");
  assert.match(await load("README.md"), /\b[0-9a-f]{40}\b/);
});
