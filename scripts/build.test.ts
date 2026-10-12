import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildCatalog, logoUri, readEntries } from "./build.ts";

const root = new URL("..", import.meta.url).pathname;

test("logoUri codifica el SVG igual que logos.ts de yunta-control", () => {
  assert.equal(logoUri('<svg fill="#000"/>\n'), "data:image/svg+xml,%3Csvg%20fill%3D%22%23000%22%2F%3E");
});

test("el catálogo de hoy: ocho servidores, en orden, válidos y con logo", async () => {
  const c = await buildCatalog(root, "v1");
  assert.equal(c.version, "v1");
  assert.deepEqual(c.servers.map((s) => s.id), ["notion", "linear", "atlassian", "cloudflare", "supabase", "stripe", "salesforce", "twenty"]);
  for (const s of c.servers) {
    assert.ok(s.logo.startsWith("data:image/svg+xml,"), s.id);
    assert.ok(s.logo.length < 5000, s.id);
  }
  assert.equal(c.servers.find((s) => s.id === "stripe")!.url, "https://mcp.stripe.com");
});

test("readEntries no lee order.json", async () => {
  assert.equal((await readEntries(root)).length, 8);
});

test("el build falla si una entrada no vale, si falta un logo o si el orden no nombra a todas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "catalogo-"));
  await mkdir(join(dir, "servers")); await mkdir(join(dir, "logos"));
  const e = { id: "uno", url: "https://a.example.com/mcp", name: "Uno", color: "#FFFFFF", tagline: "t", description: "d", settings: [], trustedLogin: [] };
  await writeFile(join(dir, "servers/uno.json"), JSON.stringify(e));
  await writeFile(join(dir, "servers/order.json"), JSON.stringify(["uno"]));
  await assert.rejects(buildCatalog(dir, "v1"), /logo/);
  await writeFile(join(dir, "logos/uno.svg"), "<svg/>");
  assert.equal((await buildCatalog(dir, "v1")).servers.length, 1);
  await writeFile(join(dir, "servers/order.json"), JSON.stringify([]));
  await assert.rejects(buildCatalog(dir, "v1"), /order/);
  await writeFile(join(dir, "servers/order.json"), JSON.stringify(["uno", "uno"]));
  await assert.rejects(buildCatalog(dir, "v1"), /order/);
  await writeFile(join(dir, "servers/order.json"), JSON.stringify(["uno"]));
  await writeFile(join(dir, "servers/dos.json"), JSON.stringify({ ...e, id: "otro" }));
  await assert.rejects(buildCatalog(dir, "v1"), /dos\.json/);
});

test("la versión es vN o dev", async () => {
  await assert.rejects(buildCatalog(root, "1.0"), /versión/);
  assert.equal((await buildCatalog(root, "dev")).version, "dev");
});
