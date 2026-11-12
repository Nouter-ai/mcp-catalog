import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkServerJson, versionErrors } from "./server-check.ts";
import { NS, type ServerJson } from "./server-json.ts";

const notion: ServerJson = JSON.parse(await readFile(new URL("../servers/notion.json", import.meta.url), "utf8"));
const con = (f: (s: any) => void): unknown => { const s = structuredClone(notion) as any; f(s); return s; };
const falla = (raw: unknown, re: RegExp) => assert.match(checkServerJson(raw).join(" | "), re);

test("una entrada del estándar válida no da errores", () => assert.deepEqual(checkServerJson(notion), []));

test("capa 1, el estándar: name, description, title, version y remotes", () => {
  falla(con((s) => { s.name = "sin-barra"; }), /name/);
  falla(con((s) => { s.name = "a/" + "b".repeat(200); }), /name/);
  falla(con((s) => { s.description = "x".repeat(101); }), /description/);
  falla(con((s) => { s.description = ""; }), /description/);
  falla(con((s) => { s.title = "x".repeat(101); }), /title/);
  falla(con((s) => { delete s.version; }), /version/);
  falla(con((s) => { s.version = "^1.2.3"; }), /version/);
  falla(con((s) => { s.version = "latest"; }), /version/);
  falla(con((s) => { s.remotes = []; }), /remotes/);
  falla(con((s) => { s.remotes[0].type = "stdio"; }), /remotes/);
  falla(con((s) => { s.remotes.push(s.remotes[0]); }), /remotes/);
  falla(con((s) => { s.$schema = "https://example.com/otro.json"; }), /\$schema/);
});

test("_meta: solo la clave de Nouter, y nunca la del registro oficial", () => {
  falla(con((s) => { s._meta["io.modelcontextprotocol.registry/publisher-provided"] = {}; }), /_meta/);
  falla(con((s) => { s._meta["com.otro/x"] = {}; }), /_meta/);
  falla(con((s) => { delete s._meta[NS]; }), /_meta/);
  falla(con((s) => { s._meta[NS].settings = "no"; }), /settings/);
});

test("capa 2, las reglas de Nouter, sobre la entrada ya convertida", () => {
  falla(con((s) => { s._meta[NS].id = "context"; }), /reservado/);
  falla(con((s) => { s.remotes[0].url = "http://mcp.notion.com/mcp"; }), /https/);
  falla(con((s) => { s.remotes[0].url = "https://localhost/mcp"; }), /privado/);
  falla(con((s) => { s.title = "x".repeat(41); }), /name/);
  falla(con((s) => { s.description = "x".repeat(61); }), /tagline/);
  falla(con((s) => { s._meta[NS].trustedLogin = ["https://login.example.com"]; }), /trustedLogin/);
  falla(con((s) => { s.remotes[0].variables = { acme: { description: "acme", isRequired: true } }; }), /hueco|settings/);
});

test("un hueco bien puesto: variable declarada y primera etiqueta del host", () => {
  const ok = con((s) => {
    s.remotes[0].url = "https://{accountId}.acme.example.com/mcp";
    s.remotes[0].variables = { accountId: { description: "accountId", isRequired: true } };
  });
  assert.deepEqual(checkServerJson(ok), []);
  falla(con((s) => { s.remotes[0].url = "https://acme.{accountId}.example.com/mcp";
    s.remotes[0].variables = { accountId: { description: "a", isRequired: true } }; }), /hueco/);
});

test("version: si cambia la URL o la autenticación, la versión tiene que subir", () => {
  const sube = (f: (s: any) => void, version?: string) => { const h = structuredClone(notion) as any; f(h); if (version) h.version = version; return versionErrors(notion, h); };
  assert.deepEqual(sube(() => {}), []);
  assert.deepEqual(sube((s) => { s.title = "Notion 2"; }), []);
  assert.match(sube((s) => { s.remotes[0].url = "https://mcp.notion.com/v2"; }).join(), /version/);
  assert.deepEqual(sube((s) => { s.remotes[0].url = "https://mcp.notion.com/v2"; }, "1.1.0"), []);
  assert.match(sube((s) => { s._meta[NS].trustedLogin = ["https://login.notion.com"]; }).join(), /version/);
  assert.match(sube((s) => { s._meta[NS].settings = [{ field: "clientId", variable: "MCP_FIXED_CLIENT_ID" }]; }).join(), /version/);
});
