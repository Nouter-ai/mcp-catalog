import assert from "node:assert/strict";
import test from "node:test";
import type { Entry } from "./entry.ts";
import { checkEntries, report } from "./sync.ts";

const entry = (over: Partial<Entry>): Entry => ({ id: "x", url: "https://a.example.com/mcp", name: "X", color: "#FFFFFF",
  tagline: "t", description: "d", settings: [], trustedLogin: [], ...over });
const registro = (status: string, urls: string[]) => Response.json({ server: { name: "n", version: "2.0.0", remotes: urls.map((url) => ({ type: "streamable-http", url })) },
  _meta: { "io.modelcontextprotocol.registry/official": { status } } });
const servidor = (rutas: Record<string, () => Response>) => (async (url: string) => {
  const r = Object.entries(rutas).find(([k]) => url.includes(encodeURIComponent(k)));
  return r ? r[1]() : new Response("", { status: 404 });
}) as unknown as typeof fetch;

test("sin registry no se consulta, y con la URL entre los remotes no hay novedades", async () => {
  let llamadas = 0;
  const f = (async () => { llamadas++; return registro("active", ["https://a.example.com/mcp"]); }) as unknown as typeof fetch;
  assert.deepEqual(await checkEntries([entry({}), entry({ id: "y", registry: "com.a/mcp" })], f), []);
  assert.equal(llamadas, 1);
});

test("la URL ya no está entre los remotes: avisa con los nuevos", async () => {
  const f = servidor({ "com.atlassian/atlassian-mcp-server": () => registro("active", ["https://mcp.atlassian.com/v2/mcp"]) });
  const [h] = await checkEntries([entry({ id: "atlassian", registry: "com.atlassian/atlassian-mcp-server", url: "https://mcp.atlassian.com/v1/mcp" })], f);
  assert.equal(h.kind, "url-distinta");
  assert.match(h.detail, /v2\/mcp/);
});

test("deprecated o deleted es retirado; un 404 es no-existe", async () => {
  const f = servidor({ "com.a/viejo": () => registro("deprecated", ["https://a.example.com/mcp"]) });
  const out = await checkEntries([entry({ id: "v", registry: "com.a/viejo" }), entry({ id: "w", registry: "com.a/nada" })], f);
  assert.deepEqual(out.map((x) => [x.id, x.kind]), [["v", "retirado"], ["w", "no-existe"]]);
});

test("un error del registro hace fallar todo: no se abre un PR que diga que no hay novedades", async () => {
  const f = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(checkEntries([entry({ registry: "com.a/mcp" })], f), /500/);
});

test("el informe avisa que cambiar la URL obliga a reconectar, y sin novedades es null", () => {
  assert.equal(report([], "2026-10-12"), null);
  const md = report([{ id: "atlassian", kind: "url-distinta", detail: "el registro publica: https://mcp.atlassian.com/v2/mcp" }], "2026-10-12")!;
  assert.match(md, /atlassian/);
  assert.match(md, /reconect/);
  assert.match(md, /2026-10-12/);
});
