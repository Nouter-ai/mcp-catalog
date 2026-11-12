import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SCHEMA_URL } from "./server-json.ts";

const load = async (p: string) => readFile(new URL(`../schema/vendor/${p}`, import.meta.url), "utf8");

test("el esquema del estándar está fijado: la versión publicada, con su URL", async () => {
  const schema = JSON.parse(await load("server.schema.json"));
  const sd = (schema.$defs ?? schema.definitions).ServerDetail;
  assert.deepEqual(sd.required.toSorted(), ["description", "name", "version"]);
  assert.equal(sd.properties.description.maxLength, 100);
  assert.equal(sd.properties.name.pattern, "^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$");
  assert.match(await load("README.md"), /schemas\/2025-12-11\/server\.schema\.json/);
  assert.equal(schema.$id, SCHEMA_URL);
});

test("cada servers/<id>.json es un server.json del estándar, con lo de Nouter solo bajo su namespace", async () => {
  const { readdir } = await import("node:fs/promises");
  const dir = new URL("../servers/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "order.json" && f !== "added-baseline.json");
  assert.equal(files.length, 26);
  for (const f of files) {
    const s = JSON.parse(await readFile(new URL(f, dir), "utf8"));
    const nativa = !!s._meta?.["ai.nouter.directory"]?.gatekeeper;
    assert.match(s.$schema, /server\.schema\.json$/, f);
    assert.match(s.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/, f);
    assert.ok(s.description.length >= 1 && s.description.length <= 100, f);
    assert.ok(s.title && s.version, f);
    if (nativa) assert.equal("remotes" in s, false, f); else assert.equal(s.remotes[0].type, "streamable-http", f);
    assert.deepEqual(Object.keys(s._meta), ["ai.nouter.directory"], f);
    assert.equal(`${s._meta["ai.nouter.directory"].id}.json`, f);
  }
});
