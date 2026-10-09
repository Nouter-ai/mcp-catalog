// Arma dist/catalog.json: las entradas en el orden de servers/order.json, con el logo como data URI.
// Uso: node scripts/build.ts vN   (sin versión, "dev")

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEntry, type Entry } from "./entry.ts";

export interface Catalog { version: string; servers: (Entry & { logo: string })[] }

// El mismo código que generó logos.ts en yunta-control: así los conectores de hoy no cambian.
export const logoUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;

export async function readEntries(dir: string): Promise<Entry[]> {
  const files = (await readdir(join(dir, "servers"))).filter((f) => f.endsWith(".json") && f !== "order.json").toSorted();
  const entries: Entry[] = [];
  for (const f of files) {
    const raw: unknown = JSON.parse(await readFile(join(dir, "servers", f), "utf8"));
    const errors = checkEntry(raw);
    if (errors.length) throw new Error(`${f}: ${errors.join("; ")}`);
    const e = raw as Entry;
    if (`${e.id}.json` !== f) throw new Error(`${f}: el id (${e.id}) tiene que ser el nombre del archivo`);
    entries.push(e);
  }
  return entries;
}

export async function buildCatalog(dir: string, version: string): Promise<Catalog> {
  if (!/^(v[1-9][0-9]*|dev)$/.test(version)) throw new Error(`versión inválida: ${version} (vN o dev)`);
  const entries = await readEntries(dir);
  const order: unknown = JSON.parse(await readFile(join(dir, "servers", "order.json"), "utf8"));
  const ids = entries.map((e) => e.id);
  if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== order.length
    || !ids.every((id) => order.includes(id))) {
    throw new Error(`servers/order.json tiene que nombrar una vez a cada entrada: ${ids.join(", ")}`);
  }
  const byId = new Map(entries.map((e) => [e.id, e]));
  const servers = [];
  for (const id of order as string[]) {
    let svg: string;
    try { svg = await readFile(join(dir, "logos", `${id}.svg`), "utf8"); } catch { throw new Error(`falta el logo logos/${id}.svg`); }
    if (!/^<svg[\s>/]/.test(svg.trim())) throw new Error(`logos/${id}.svg no es un SVG`);
    const logo = logoUri(svg);
    if (logo.length >= 5000) throw new Error(`logos/${id}.svg es muy grande (${logo.length} como data URI)`);
    servers.push({ ...byId.get(id)!, logo });
  }
  return { version, servers };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  const catalog = await buildCatalog(root, process.argv[2] ?? "dev");
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`dist/catalog.json: ${catalog.version}, ${catalog.servers.length} servidores`);
}
