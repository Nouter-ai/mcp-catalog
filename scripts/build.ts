// Arma dist/catalog.json: las entradas en el orden de servers/order.json, con el logo como data URI.
// Uso: node scripts/build.ts vN [fecha ISO del release]   (sin versión, "dev"). También arma dist/registry/.

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Entry } from "./entry.ts";
import { checkServerJson } from "./server-check.ts";
import { isNative, toNative, type NativeEntry, type NativeServerJson, type TenantSetting } from "./native.ts";
import { NS, toEntry, type ServerJson } from "./server-json.ts";

// Lo que lee yunta-control (src/catalogo-mcp.ts y src/catalog.ts): los MCP remotos, los gatekeepers nativos con la forma de
// un Connector, y los servicios que tienen nativo pero se siguen ofreciendo como MCP hasta que su app OAuth esté.
export interface CatalogNative {
  id: string; pkg: string; landing?: string; display: { name: string; logo: string; tagline: string }; relay?: boolean;
  secrets?: Record<string, string>; settings?: TenantSetting[]; flag?: string; zoneVars?: Record<string, string>; offered?: false;
}
export interface Catalog {
  version: string; servers: (Entry & { logo: string })[]; natives: CatalogNative[]; nativePending: { id: string; pkg: string }[];
}

// El mismo código que generó logos.ts en yunta-control: así los conectores de hoy no cambian.
export const logoUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;

export interface Servers { mcp: Entry[]; natives: NativeEntry[]; pending: { id: string; pkg: string }[] }

export async function readServers(dir: string): Promise<Servers> {
  const files = (await readdir(join(dir, "servers"))).filter((f) => f.endsWith(".json") && f !== "order.json").toSorted();
  const out: Servers = { mcp: [], natives: [], pending: [] };
  const names = new Map<string, string>();
  for (const f of files) {
    const raw: unknown = JSON.parse(await readFile(join(dir, "servers", f), "utf8"));
    const errors = checkServerJson(raw);
    if (errors.length) throw new Error(`${f}: ${errors.join("; ")}`);
    const name = (raw as { name: string }).name;
    if (names.has(name)) throw new Error(`${f}: el name ${name} está repetido (también en ${names.get(name)})`);
    names.set(name, f);
    const e = isNative(raw) ? toNative(raw as NativeServerJson) : toEntry(raw as ServerJson);
    if (`${e.id}.json` !== f) throw new Error(`${f}: el id (${e.id}) tiene que ser el nombre del archivo`);
    if (isNative(raw)) out.natives.push(e as NativeEntry);
    else {
      out.mcp.push(e as Entry);
      const pkg = (raw as ServerJson)._meta[NS] as unknown as { nativeGatekeeper?: string };
      if (pkg.nativeGatekeeper) out.pending.push({ id: e.id, pkg: pkg.nativeGatekeeper });
    }
  }
  return out;
}

export const readEntries = async (dir: string): Promise<Entry[]> => (await readServers(dir)).mcp;

export async function buildCatalog(dir: string, version: string): Promise<Catalog> {
  if (!/^(v[1-9][0-9]*|dev)$/.test(version)) throw new Error(`versión inválida: ${version} (vN o dev)`);
  const { mcp, natives, pending } = await readServers(dir);
  const order: unknown = JSON.parse(await readFile(join(dir, "servers", "order.json"), "utf8"));
  const ids = [...mcp, ...natives].map((e) => e.id);
  if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== order.length
    || !ids.every((id) => order.includes(id))) {
    throw new Error(`servers/order.json tiene que nombrar una vez a cada entrada: ${ids.join(", ")}`);
  }
  const logo = async (id: string) => {
    let svg: string;
    try { svg = await readFile(join(dir, "logos", `${id}.svg`), "utf8"); } catch { throw new Error(`falta el logo logos/${id}.svg`); }
    if (!/^<svg[\s>/]/.test(svg.trim())) throw new Error(`logos/${id}.svg no es un SVG`);
    const uri = logoUri(svg);
    if (uri.length >= 5000) throw new Error(`logos/${id}.svg es muy grande (${uri.length} como data URI)`);
    return uri;
  };
  const mcpById = new Map(mcp.map((e) => [e.id, e])), nativeById = new Map(natives.map((e) => [e.id, e]));
  const servers: Catalog["servers"] = [], out: CatalogNative[] = [];
  for (const id of order as string[]) {
    const m = mcpById.get(id), n = nativeById.get(id);
    if (m) servers.push({ ...m, logo: await logo(id) });
    else if (n) {
      out.push({ id: n.id, pkg: n.pkg, ...(n.landing ? { landing: n.landing } : {}), display: { name: n.name, logo: await logo(id), tagline: n.tagline },
        ...(n.relay ? { relay: true } : {}), ...(n.secrets ? { secrets: n.secrets } : {}), ...(n.settings ? { settings: n.settings } : {}),
        ...(n.flag ? { flag: n.flag } : {}), ...(n.zoneVars ? { zoneVars: n.zoneVars } : {}), ...(n.offered === false ? { offered: false as const } : {}) });
    }
  }
  return { version, servers, natives: out, nativePending: pending };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  const catalog = await buildCatalog(root, process.argv[2] ?? "dev");
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`dist/catalog.json: ${catalog.version}, ${catalog.servers.length} servidores`);
  // El registro estático (scripts/registry.ts). La fecha es la del release (tercer argumento); sin ella, la época, para que
  // un armado local sea reproducible.
  const { buildRegistry } = await import("./registry.ts");
  const files = await buildRegistry(root, catalog.version, process.argv[3] ?? "1970-01-01T00:00:00Z");
  await rm(join(root, "dist", "registry"), { recursive: true, force: true });
  for (const [path, body] of files) {
    await mkdir(join(root, "dist", "registry", path, ".."), { recursive: true });
    await writeFile(join(root, "dist", "registry", path), body);
  }
  console.log(`dist/registry: ${files.size} archivos`);
}
