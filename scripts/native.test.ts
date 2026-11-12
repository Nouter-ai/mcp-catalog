import assert from "node:assert/strict";
import test from "node:test";
import { checkServerJson } from "./server-check.ts";
import type { DirectoryMeta } from "./directory.ts";
import { isNative, toNative, toNativeServerJson as nativoSin, type NativeEntry } from "./native.ts";

// Los datos de la vidriera: ahora la entrada los exige, y los tests parten de una válida.
const DIR: DirectoryMeta = { categories: ["engineering"], publisher: "Nouter", verified: true, signIn: "account" };
const toNativeServerJson = (n: NativeEntry, version = "1.0.0", directory: DirectoryMeta = DIR) => nativoSin(n, version, directory);

const slack: NativeEntry = {
  id: "slack", pkg: "gatekeeper-slack", name: "Slack", tagline: "Channels, messages and search", color: "#FFFFFF",
  landing: "Slack, con la app de tu empresa",
  settings: [{ field: "clientId", variable: "CLIENT_ID", into: "secrets" },
    { field: "clientSecret", variable: "CLIENT_SECRET", into: "secrets", secret: true }],
};
const github: NativeEntry = { ...slack, id: "github", pkg: "gatekeeper-github", name: "GitHub", landing: "GitHub",
  relay: true, secrets: { CLIENT_ID: "GITHUB_APP_CLIENT_ID", CLIENT_SECRET: "GITHUB_APP_CLIENT_SECRET" } };
const control: NativeEntry = { id: "control", pkg: "gatekeeper-control", name: "Nouter control plane", tagline: "Tenants, versions and costs",
  color: "#FFFFFF", flag: "gatekeeper-control", zoneVars: { CONTROL_URL: "https://ops.{zone}" } };
const con = (n: NativeEntry, f: (s: any) => void): unknown => { const s = structuredClone(toNativeServerJson(n)) as any; f(s); return s; };
const falla = (raw: unknown, re: RegExp) => assert.match(checkServerJson(raw).join(" | "), re);

test("una entrada nativa es un server.json sin remotes, con lo del gatekeeper bajo el namespace de Nouter", () => {
  const s = toNativeServerJson(slack) as any;
  assert.equal(s.name, "ai.nouter/slack");
  assert.equal(s.title, "Slack");
  assert.equal(s.description, "Channels, messages and search");
  assert.equal("remotes" in s, false);
  assert.equal(s._meta["ai.nouter.directory"].gatekeeper.package, "gatekeeper-slack");
  assert.equal(isNative(s), true);
});

test("ida y vuelta sin pérdida, con relay, flag y variables de zona", () => {
  for (const n of [slack, github, control, { ...slack, id: "email", pkg: "gatekeeper-email", offered: false as const }]) {
    assert.deepEqual(toNative(toNativeServerJson(n)), n, n.id);
  }
});

test("las nativas válidas no dan errores", () => {
  for (const n of [slack, github, control]) assert.deepEqual(checkServerJson(toNativeServerJson(n)), [], n.id);
});

test("el paquete es gatekeeper-<id>, y mcp-portal puede llevar el prefijo reservado a los MCP propios", () => {
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].gatekeeper.package = "gatekeeper-otro"; }), /package/);
  assert.deepEqual(checkServerJson(toNativeServerJson({ ...control, id: "mcp-portal", pkg: "gatekeeper-mcp-portal" })), []);
});

test("el name es ai.nouter/<id> y no lleva remotes", () => {
  falla(con(slack, (s) => { s.name = "com.slack/mcp"; }), /name/);
  falla(con(slack, (s) => { s.remotes = [{ type: "streamable-http", url: "https://x.example.com" }]; }), /remotes/);
});

test("los topes: title 40, tagline 60, landing 80, color", () => {
  falla(con(slack, (s) => { s.title = "x".repeat(41); }), /name|title/);
  falla(con(slack, (s) => { s.description = "x".repeat(61); }), /tagline|description/);
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].landing = "x".repeat(81); }), /landing/);
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].color = "blanco"; }), /color/);
});

test("los ajustes del tenant: campo, variable en mayúsculas, vars o secrets, y un secret va a secrets", () => {
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].gatekeeper.settings[0].variable = "clientId"; }), /settings/);
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].gatekeeper.settings[0].into = "otro"; }), /settings/);
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].gatekeeper.settings[1].into = "vars"; }), /secret/);
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].gatekeeper.settings.push({ field: "clientId", variable: "X" }); }), /repetido|settings/);
});

test("relay: los secrets de Nouter solo con relay, y con nombres de variable", () => {
  falla(con(github, (s) => { delete s._meta["ai.nouter.directory"].gatekeeper.relay; }), /relay/);
  falla(con(github, (s) => { s._meta["ai.nouter.directory"].gatekeeper.secrets = { CLIENT_ID: "no valido" }; }), /secrets/);
});

test("offered solo puede ser false, y el flag y las variables de zona tienen forma", () => {
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].gatekeeper.offered = true; }), /offered/);
  falla(con(control, (s) => { s._meta["ai.nouter.directory"].gatekeeper.flag = ""; }), /flag/);
  falla(con(control, (s) => { s._meta["ai.nouter.directory"].gatekeeper.zoneVars = { control_url: "x" }; }), /zoneVars/);
});

test("una entrada MCP puede declarar que su servicio ya tiene gatekeeper nativo, sin ofrecerlo todavía", async () => {
  const { toServerJson } = await import("./server-json.ts");
  const s = toServerJson({ id: "notion", registry: "com.notion/mcp", url: "https://mcp.notion.com/mcp", name: "Notion", color: "#FFFFFF",
    tagline: "t", description: "d", settings: [], trustedLogin: [] }, "1.0.0", DIR) as any;
  s._meta["ai.nouter.directory"].nativeGatekeeper = "gatekeeper-notion";
  assert.deepEqual(checkServerJson(s), []);
  s._meta["ai.nouter.directory"].nativeGatekeeper = "notion";
  falla(s, /nativeGatekeeper/);
});

test("endurecimiento: ids ambientales y el prefijo mcp- (salvo mcp-portal) no los toma una entrada nativa", () => {
  for (const id of ["context", "scheduler", "mcp", "workshop", "router", "mcp-full"]) {
    falla(toNativeServerJson({ ...control, id, pkg: `gatekeeper-${id}` }), /reservado/);
  }
  assert.deepEqual(checkServerJson(toNativeServerJson({ ...control, id: "mcp-portal", pkg: "gatekeeper-mcp-portal" })), []);
});

test("endurecimiento: una variable no pisa las del OS (BASE_URL, OAUTH_*, MCP_FIXED_*, YUNTA_*), en ajustes, zona y secrets", () => {
  for (const variable of ["BASE_URL", "OAUTH_REDIRECT_URI", "OAUTH_RELAY_TENANT_HOSTS", "MCP_FIXED_URL", "YUNTA_SIBLINGS"]) {
    falla(con(slack, (s) => { s._meta["ai.nouter.directory"].gatekeeper.settings[0].variable = variable; }), /reservada/);
    falla(con(control, (s) => { s._meta["ai.nouter.directory"].gatekeeper.zoneVars = { [variable]: "https://x.{zone}" }; }), /reservada/);
    falla(con(github, (s) => { s._meta["ai.nouter.directory"].gatekeeper.secrets = { [variable]: "GITHUB_APP_CLIENT_ID" }; }), /reservada/);
  }
});

test("endurecimiento: dos ajustes no llenan la misma variable", () => {
  falla(con(slack, (s) => { s._meta["ai.nouter.directory"].gatekeeper.settings[1].variable = "CLIENT_ID"; }), /variable.*repetida|repetida/);
});

test("los datos de la vidriera: uno por campo, y una clave desconocida en _meta", () => {
  const m = (s: any) => s._meta["ai.nouter.directory"];
  falla(con(slack, (s) => { delete m(s).signIn; }), /signIn/);
  falla(con(slack, (s) => { delete m(s).categories; }), /categories/);
  falla(con(slack, (s) => { m(s).categories = ["engineering", "sales", "legal", "finance"]; }), /categories/);
  falla(con(slack, (s) => { m(s).categories = ["otra"]; }), /categories/);
  falla(con(slack, (s) => { m(s).publisher = ""; }), /publisher/);
  falla(con(slack, (s) => { m(s).verified = 1; }), /verified/);
  falla(con(slack, (s) => { m(s).signIn = "otro"; }), /signIn/);
  falla(con(slack, (s) => { m(s).extra = 1; }), /desconocida/);
});
