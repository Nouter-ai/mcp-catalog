import assert from "node:assert/strict";
import test from "node:test";
import { checkEntry, checkUrl } from "./entry.ts";

const base = {
  id: "notion", registry: "com.notion/mcp", url: "https://mcp.notion.com/mcp", name: "Notion",
  landing: { es: "Notion" }, color: "#FFFFFF", tagline: "Pages, databases and comments",
  description: "Notion's official MCP server.", settings: [], trustedLogin: [],
};
const con = (over: Record<string, unknown>) => ({ ...base, ...over });

test("una entrada completa vale, y registry y landing son opcionales", () => {
  assert.deepEqual(checkEntry(base), []);
  const { registry, landing, ...sin } = base;
  assert.deepEqual(checkEntry(sin), []);
});

test("el id: formato, reservados y el prefijo de los MCP propios", () => {
  for (const id of ["Notion", "1abc", "a_b", "x".repeat(21), "context", "scheduler", "mcp", "google", "slack", "github", "mcp-full"]) {
    assert.notDeepEqual(checkEntry(con({ id })), [], id);
  }
  assert.deepEqual(checkEntry(con({ id: "a-1" })), []);
});

test("la URL: https, sin credenciales, sin fragmento y sin hosts privados", () => {
  assert.equal(checkUrl("https://mcp.stripe.com"), null);
  for (const u of ["http://mcp.x.com/mcp", "https://u:p@mcp.x.com/mcp", "https://mcp.x.com/mcp#a", "https://localhost/mcp",
    "https://127.0.0.1/mcp", "https://10.0.0.1/mcp", "https://192.168.1.1/mcp", "https://[::1]/mcp", "https://x.internal/mcp", "nada"]) {
    assert.notEqual(checkUrl(u), null, u);
  }
});

test("la URL no se normaliza: la entrada guarda lo que se escribió", () => {
  // checkEntry no reescribe nada: valida y nada más. Un cambio de URL cambia la identidad del conector.
  const e = con({ url: "https://mcp.stripe.com" });
  assert.deepEqual(checkEntry(e), []);
  assert.equal(e.url, "https://mcp.stripe.com");
});

test("textos: obligatorios y con tope", () => {
  for (const [k, n] of [["name", 41], ["tagline", 61], ["description", 301]] as const) {
    assert.notDeepEqual(checkEntry(con({ [k]: "x".repeat(n) })), [], k);
    assert.notDeepEqual(checkEntry(con({ [k]: "" })), [], k);
  }
  assert.notDeepEqual(checkEntry(con({ landing: { es: "x".repeat(81) } })), []);
  assert.notDeepEqual(checkEntry(con({ landing: { en: "Notion" } })), []);
});

test("el color es #RRGGBB en mayúsculas", () => {
  assert.notDeepEqual(checkEntry(con({ color: "#fff" })), []);
  assert.notDeepEqual(checkEntry(con({ color: "white" })), []);
});

test("settings: solo MCP_FIXED_CLIENT_ID, nunca un secret ni otra variable", () => {
  assert.deepEqual(checkEntry(con({ settings: [{ field: "clientId", variable: "MCP_FIXED_CLIENT_ID" }] })), []);
  for (const variable of ["BASE_URL", "CLIENT_SECRET", "MCP_FIXED_CLIENT_SECRET", "MCP_FIXED_URL"]) {
    assert.notDeepEqual(checkEntry(con({ settings: [{ field: "clientId", variable }] })), [], variable);
  }
  assert.notDeepEqual(checkEntry(con({ settings: [{ field: "client id", variable: "MCP_FIXED_CLIENT_ID" }] })), []);
});

test("una clave desconocida se rechaza", () => {
  assert.notDeepEqual(checkEntry(con({ secrets: { A: "b" } })), []);
});

test("registry y trustedLogin con su formato", () => {
  assert.notDeepEqual(checkEntry(con({ registry: "notion" })), []);
  assert.deepEqual(checkEntry(con({ trustedLogin: ["github.com"] })), []);
  assert.notDeepEqual(checkEntry(con({ trustedLogin: ["https://github.com"] })), []);
});

test("algo que no es un objeto", () => {
  for (const raw of [null, [], "x", 1]) assert.notDeepEqual(checkEntry(raw), []);
});
