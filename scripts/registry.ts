// El registro estático en el formato de la API de un registro del MCP (docs/reference/api/openapi.yaml del repo
// modelcontextprotocol/registry): la lista, las versiones de cada servidor, latest y cada versión. Solo lectura y sin
// servidor: archivos. Devuelve ruta -> contenido; `publishedAt` es el del release, no el reloj, para que sea reproducible.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkServerJson } from "./server-check.ts";
import type { ServerJson } from "./server-json.ts";

const OFFICIAL = "io.modelcontextprotocol.registry/official";

export async function buildRegistry(dir: string, _version: string, publishedAt: string): Promise<Map<string, string>> {
  const order: string[] = JSON.parse(await readFile(join(dir, "servers", "order.json"), "utf8"));
  const out = new Map<string, string>();
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  const rows: unknown[] = [];
  for (const id of order) {
    const server: ServerJson = JSON.parse(await readFile(join(dir, "servers", `${id}.json`), "utf8"));
    const errors = checkServerJson(server);
    if (errors.length) throw new Error(`${id}: ${errors.join("; ")}`);
    const row = { server, _meta: { [OFFICIAL]: { status: "active", publishedAt, isLatest: true } } };
    rows.push(row);
    const base = `v0.1/servers/${encodeURIComponent(server.name)}`;
    out.set(`${base}/versions.json`, json({ servers: [row], metadata: { count: 1, nextCursor: null } }));
    out.set(`${base}/versions/latest.json`, json(row));
    out.set(`${base}/versions/${encodeURIComponent(server.version)}.json`, json(row));
  }
  out.set("v0.1/servers.json", json({ servers: rows, metadata: { count: rows.length, nextCursor: null } }));
  return new Map([...out.entries()].toSorted(([a], [b]) => (a < b ? -1 : 1)));
}
