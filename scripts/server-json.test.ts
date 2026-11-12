import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import type { Entry } from "./entry.ts";
import { NS, toEntry, toServerJson } from "./server-json.ts";

const real: Entry[] = [];
for (const f of (await readdir(new URL("../servers", import.meta.url))).filter((f) => f.endsWith(".json") && f !== "order.json")) {
  real.push(toEntry(JSON.parse(await readFile(new URL(`../servers/${f}`, import.meta.url), "utf8"))));
}
const withHole: Entry = {
  id: "acme", url: "https://{accountId}.acme.example.com/mcp", name: "Acme", color: "#112233", tagline: "Acme things",
  description: "Acme's server.", landing: { es: "Acme" },
  settings: [{ field: "accountId", fills: "url" }, { field: "clientId", variable: "MCP_FIXED_CLIENT_ID" }],
  trustedLogin: ["https://login.acme.example.com"],
};

test("las entradas reales dan la ida y vuelta sin pérdida", () => {
  assert.ok(real.length >= 7);
  for (const e of [...real, withHole]) assert.deepEqual(toEntry(toServerJson(e)), e, e.id);
});

test("el name es el del registro oficial si hay registry, y ai.nouter/<id> si no", () => {
  const notion = real.find((e) => e.id === "notion")!;
  assert.equal(toServerJson(notion).name, notion.registry);
  assert.equal(toServerJson(withHole).name, "ai.nouter/acme");
});

test("title, description y version salen de name, tagline y del parámetro", () => {
  const s = toServerJson(withHole, "2.1.0");
  assert.equal(s.title, "Acme"); assert.equal(s.description, "Acme things"); assert.equal(s.version, "2.1.0");
  assert.equal(toServerJson(withHole).version, "1.0.0");
});

test("el hueco pasa a remotes[].variables y su setting fills sale de _meta", () => {
  const s = toServerJson(withHole);
  assert.deepEqual(s.remotes, [{ type: "streamable-http", url: withHole.url,
    variables: { accountId: { description: "accountId", isRequired: true } } }]);
  assert.deepEqual(s._meta[NS].settings, [{ field: "clientId", variable: "MCP_FIXED_CLIENT_ID" }]);
});

test("sin hueco no hay variables; lo de Nouter va solo bajo su namespace", () => {
  const s = toServerJson(real[0]);
  assert.equal("variables" in s.remotes[0], false);
  assert.deepEqual(Object.keys(s._meta), [NS]);
  assert.equal(NS, "ai.nouter.directory");
});
