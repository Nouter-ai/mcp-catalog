// Las entradas de los gatekeepers nativos del OS (upstream y de Nouter): un server.json sin `remotes`, con lo del
// gatekeeper bajo _meta["ai.nouter.directory"].gatekeeper. Es lo que yunta-control convierte en un Connector (src/catalog.ts):
// el paquete, los ajustes que carga el admin (lo que el gatekeeper declara en deploy-inputs.json), la app de Nouter por el
// relay, el flag y las variables de zona. docs/nouter/producto/conectores/nouter-directory.md.

import type { DirectoryMeta } from "./directory.ts";
import { directoryMetaErrors } from "./directory.ts";
import { NS, SCHEMA_URL } from "./server-json.ts";

export interface TenantSetting { field: string; variable: string; secret?: boolean; into?: "vars" | "secrets"; optional?: boolean }
export interface NativeEntry {
  id: string; pkg: string; name: string; tagline: string; color: string; landing?: string;
  relay?: boolean; secrets?: Record<string, string>; settings?: TenantSetting[]; flag?: string;
  zoneVars?: Record<string, string>;
  // Está en el Directory pero todavía no se ofrece (por ejemplo, Email necesita Email Routing en el dominio del tenant).
  offered?: false;
}
interface GatekeeperMeta { package: string; relay?: boolean; secrets?: Record<string, string>; settings?: TenantSetting[]; flag?: string;
  zoneVars?: Record<string, string>; offered?: false }
export interface NativeServerJson {
  $schema: string; name: string; title: string; description: string; version: string;
  _meta: Record<string, { id: string; color: string; landing?: string; gatekeeper: GatekeeperMeta } & Partial<DirectoryMeta>>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isNative = (raw: unknown): boolean => isObj(raw) && isObj(raw._meta) && isObj(raw._meta[NS]) && isObj((raw._meta[NS] as Record<string, unknown>).gatekeeper);

export function toNativeServerJson(n: NativeEntry, version = "1.0.0", directory?: DirectoryMeta): NativeServerJson {
  const g: GatekeeperMeta = { package: n.pkg, ...(n.relay ? { relay: true } : {}), ...(n.secrets ? { secrets: n.secrets } : {}),
    ...(n.settings ? { settings: n.settings } : {}), ...(n.flag ? { flag: n.flag } : {}), ...(n.zoneVars ? { zoneVars: n.zoneVars } : {}),
    ...(n.offered === false ? { offered: false as const } : {}) };
  return { $schema: SCHEMA_URL, name: `ai.nouter/${n.id}`, title: n.name, description: n.tagline, version,
    _meta: { [NS]: { id: n.id, color: n.color, ...(n.landing ? { landing: n.landing } : {}), gatekeeper: g, ...directory } } };
}

export function toNative(s: NativeServerJson): NativeEntry {
  const m = s._meta[NS], g = m.gatekeeper;
  return { id: m.id, pkg: g.package, name: s.title, tagline: s.description, color: m.color, ...(m.landing ? { landing: m.landing } : {}),
    ...(g.relay ? { relay: true } : {}), ...(g.secrets ? { secrets: g.secrets } : {}), ...(g.settings ? { settings: g.settings } : {}),
    ...(g.flag ? { flag: g.flag } : {}), ...(g.zoneVars ? { zoneVars: g.zoneVars } : {}), ...(g.offered === false ? { offered: false as const } : {}) };
}

const VAR = /^[A-Z][A-Z0-9_]*$/;
// Lo que el OS pone en cada gatekeeper (connectorVars en yunta-control): una entrada no lo pisa.
const RESERVADA = /^(BASE_URL|OAUTH_|MCP_FIXED_|YUNTA_)/;
// Los ids de lo que ya existe en cada tenant sin ser un nativo del Directory.
const AMBIENTALES = ["context", "scheduler", "mcp", "workshop", "router"];
const str = (v: unknown, min: number, max: number) => typeof v === "string" && v.length >= min && v.length <= max;

function checkGatekeeper(id: string, g: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const known = new Set(["package", "relay", "secrets", "settings", "flag", "zoneVars", "offered"]);
  for (const k of Object.keys(g)) if (!known.has(k)) errors.push(`gatekeeper: clave desconocida ${k}`);
  if (g.package !== `gatekeeper-${id}`) errors.push(`gatekeeper.package: tiene que ser gatekeeper-${id}`);
  if (AMBIENTALES.includes(id) || (id.startsWith("mcp-") && id !== "mcp-portal")) {
    errors.push(`id: ${id} está reservado (los ambientales y el prefijo mcp- de los MCP propios; mcp-portal es la excepción)`);
  }
  if (g.relay !== undefined && g.relay !== true) errors.push("gatekeeper.relay: solo true");
  if (g.secrets !== undefined) {
    if (g.relay !== true) errors.push("gatekeeper.secrets: las apps de Nouter solo van con relay: true");
    if (!isObj(g.secrets) || !Object.entries(g.secrets).every(([k, v]) => VAR.test(k) && typeof v === "string" && VAR.test(v))) {
      errors.push("gatekeeper.secrets: { SECRET_DEL_GATEKEEPER: VARIABLE_DE_NOUTER } en mayúsculas");
    }
  }
  const reservadas = [...Object.keys(isObj(g.secrets) ? g.secrets : {}), ...Object.keys(isObj(g.zoneVars) ? g.zoneVars : {}),
    ...(Array.isArray(g.settings) ? g.settings.map((x) => (isObj(x) ? String(x.variable) : "")) : [])].filter((v) => RESERVADA.test(v));
  if (reservadas.length) errors.push(`gatekeeper: ${[...new Set(reservadas)].join(", ")} es una variable reservada del OS (BASE_URL, OAUTH_*, MCP_FIXED_*, YUNTA_*)`);
  if (g.settings !== undefined) {
    if (!Array.isArray(g.settings)) errors.push("gatekeeper.settings: tiene que ser una lista");
    else {
      const fields = new Set<string>();
      const variables = new Set<string>();
      for (const s of g.settings) {
        const ok = isObj(s) && typeof s.field === "string" && /^[a-zA-Z]{1,30}$/.test(s.field) && typeof s.variable === "string" && VAR.test(s.variable)
          && (s.into === undefined || s.into === "vars" || s.into === "secrets") && (s.secret === undefined || typeof s.secret === "boolean")
          && (s.optional === undefined || typeof s.optional === "boolean")
          && Object.keys(s).every((k) => ["field", "variable", "into", "secret", "optional"].includes(k));
        if (!ok) { errors.push("gatekeeper.settings: { field, variable en mayúsculas, into?: vars|secrets, secret?, optional? }"); continue; }
        if (s.secret === true && s.into !== "secrets") errors.push(`gatekeeper.settings: ${s.field} es un secret y tiene que ir a into: "secrets"`);
        if (fields.has(s.field as string)) errors.push(`gatekeeper.settings: ${s.field} repetido`);
        fields.add(s.field as string);
        if (variables.has(s.variable as string)) errors.push(`gatekeeper.settings: la variable ${s.variable} está repetida`);
        variables.add(s.variable as string);
      }
    }
  }
  if (g.flag !== undefined && !(typeof g.flag === "string" && /^[a-z][a-z0-9-]*$/.test(g.flag))) errors.push("gatekeeper.flag: el nombre de un flag, en minúsculas");
  if (g.zoneVars !== undefined && !(isObj(g.zoneVars) && Object.entries(g.zoneVars).every(([k, v]) => VAR.test(k) && typeof v === "string" && v.length > 0))) {
    errors.push("gatekeeper.zoneVars: { VARIABLE: valor con {zone} } en mayúsculas");
  }
  if (g.offered !== undefined && g.offered !== false) errors.push("gatekeeper.offered: solo false (lo que se ofrece no se marca)");
  return errors;
}

export function checkNativeServerJson(raw: unknown): string[] {
  if (!isObj(raw)) return ["la entrada tiene que ser un objeto"];
  const errors: string[] = [];
  const m = isObj(raw._meta) ? raw._meta : {};
  const n = isObj(m[NS]) ? m[NS] : {};
  const id = typeof n.id === "string" ? n.id : "";
  if (raw.$schema !== SCHEMA_URL) errors.push("$schema: tiene que ser el del esquema fijado (scripts/server-json.ts)");
  if (!/^[a-z][a-z0-9-]{0,19}$/.test(id)) errors.push("_meta: id en minúsculas, letras, números y guiones, hasta 20");
  if (raw.name !== `ai.nouter/${id}`) errors.push(`name: una entrada nativa se llama ai.nouter/${id}`);
  if (!str(raw.title, 1, 40)) errors.push("title: obligatorio, hasta 40");
  if (!str(raw.description, 1, 60)) errors.push("description: el tagline, obligatorio, hasta 60");
  if (typeof raw.version !== "string" || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(raw.version)) errors.push("version: obligatoria, semver exacto (1.0.0)");
  if ("remotes" in raw) errors.push("remotes: una entrada nativa no lleva remotes (es un gatekeeper del OS, no un servidor MCP)");
  if (Object.keys(m).join() !== NS) errors.push(`_meta: solo la clave ${NS}`);
  if (typeof n.color !== "string" || !/^#[0-9A-F]{6}$/.test(n.color)) errors.push("_meta: color #RRGGBB en mayúsculas");
  if (n.landing !== undefined && !str(n.landing, 1, 80)) errors.push("_meta: landing hasta 80");
  errors.push(...directoryMetaErrors(n, ["id", "color", "landing", "gatekeeper", "categories", "publisher", "verified", "signIn"]));
  if (!isObj(n.gatekeeper)) errors.push("_meta: gatekeeper"); else errors.push(...checkGatekeeper(id, n.gatekeeper));
  return errors;
}
