import assert from "node:assert/strict";
import test from "node:test";
import { probe } from "./probe.ts";

const fake = (res: Response) => (async () => res) as unknown as typeof fetch;

test("un 401, con o sin Bearer, es un MCP que pide login", async () => {
  // Salesforce contesta 401 sin WWW-Authenticate (medido el 2026-10-09).
  assert.equal((await probe("https://a.example.com/mcp", fake(new Response("", { status: 401 })))).ok, true);
});

test("un 200 con JSON-RPC, en JSON o en SSE, es un MCP", async () => {
  const json = new Response('{"jsonrpc":"2.0","id":1,"result":{}}', { headers: { "content-type": "application/json" } });
  assert.equal((await probe("https://a.example.com/mcp", fake(json))).ok, true);
  const sse = new Response('event: message\ndata: {"jsonrpc":"2.0","id":1}\n\n', { headers: { "content-type": "text/event-stream" } });
  assert.equal((await probe("https://a.example.com/mcp", fake(sse))).ok, true);
});

test("una página HTML, un 404, una redirección o un error de red no son un MCP", async () => {
  const html = new Response("<html></html>", { headers: { "content-type": "text/html" } });
  for (const res of [html, new Response("", { status: 404 }), new Response("", { status: 302, headers: { location: "https://b.example.com" } })]) {
    const r = await probe("https://a.example.com/mcp", fake(res));
    assert.equal(r.ok, false);
    assert.ok(r.detail.length > 0);
  }
  const roto = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
  assert.deepEqual(await probe("https://a.example.com/mcp", roto), { ok: false, detail: "ECONNREFUSED" });
});

test("pide initialize por POST, sin seguir redirecciones", async () => {
  let init: RequestInit | undefined;
  const espia = (async (_: string, i: RequestInit) => { init = i; return new Response("", { status: 401 }); }) as unknown as typeof fetch;
  await probe("https://a.example.com/mcp", espia);
  assert.equal(init!.method, "POST");
  assert.equal(init!.redirect, "manual");
  assert.match(String(init!.body), /"method":"initialize"/);
});
