import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCatalog } from "./build.ts";
import { buildRegistry } from "./registry.ts";
import { checkServerJson } from "./server-check.ts";

const root = new URL("..", import.meta.url).pathname;
const AT = "2026-11-12T00:00:00Z";
const OFFICIAL = "io.modelcontextprotocol.registry/official";

test("el catalog.json de las entradas migradas es idéntico al v8 que usa yunta-control", async () => {
  const v8 = JSON.parse(await readFile(new URL("../fixtures/catalog-v8.json", import.meta.url), "utf8"));
  assert.deepEqual(await buildCatalog(root, "v8"), v8);
});

test("la lista tiene la forma de /v0.1/servers, una fila por servidor y en el orden del catálogo", async () => {
  const files = await buildRegistry(root, "v1", AT);
  const list = JSON.parse(files.get("v0.1/servers.json")!);
  assert.equal(list.metadata.count, 7);
  assert.equal(list.metadata.nextCursor, null);
  assert.deepEqual(list.servers.map((r: any) => r.server.title),
    ["Notion", "Linear", "Atlassian", "Cloudflare", "Supabase", "Stripe", "Twenty"]);
  for (const r of list.servers) {
    assert.deepEqual(checkServerJson(r.server), [], r.server.name);
    assert.deepEqual(r._meta[OFFICIAL], { status: "active", publishedAt: AT, isLatest: true });
  }
});

test("cada servidor tiene sus versiones, latest y su versión exacta, con el name codificado en la ruta", async () => {
  const files = await buildRegistry(root, "v1", AT);
  const dir = "v0.1/servers/com.notion%2Fmcp";
  const versions = JSON.parse(files.get(`${dir}/versions.json`)!);
  assert.equal(versions.servers.length, 1);
  const latest = JSON.parse(files.get(`${dir}/versions/latest.json`)!);
  assert.deepEqual(latest, JSON.parse(files.get(`${dir}/versions/1.0.0.json`)!));
  assert.equal(latest.server.name, "com.notion/mcp");
  assert.deepEqual(Object.keys(latest).toSorted(), ["_meta", "server"]);
  assert.equal([...files.keys()].filter((k) => k.endsWith("/versions/latest.json")).length, 7);
});

test("el armado es reproducible: mismos archivos y mismos bytes", async () => {
  const a = await buildRegistry(root, "v1", AT), b = await buildRegistry(root, "v1", AT);
  assert.deepEqual([...a.entries()], [...b.entries()]);
});
