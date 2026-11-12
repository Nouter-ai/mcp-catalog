// El CI: todas las entradas valen y el build pasa. Con --probe <ref>, prueba las URLs de las entradas que cambiaron
// respecto de <ref> (en un PR, la base). Uso: node scripts/validate.ts [--probe origin/main]

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./build.ts";
import { urlHoles, type Entry } from "./entry.ts";
import { probe } from "./probe.ts";
import { versionErrors } from "./server-check.ts";
import type { ServerJson } from "./server-json.ts";

// Una url con hueco no tiene un host de ejemplo que resuelva: se prueba en un tenant (docs/yunta/netsuite.md).
export const probeable = (e: Pick<Entry, "url">): boolean => urlHoles(e.url).length === 0;

export function changedIds(files: string[]): string[] {
  return files.flatMap((f) => { const m = /^servers\/([a-z0-9-]+)\.json$/.exec(f); return m && m[1] !== "order" ? [m[1]] : []; });
}

// Cambiar la URL o la autenticación obliga a reconectar: la versión tiene que subir. Una base en el formato viejo (el PR
// que migra) o una entrada nueva no se compara.
export async function versionCheck(root: string, base: string, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    let before: ServerJson;
    try {
      before = JSON.parse(execFileSync("git", ["show", `${base}:servers/${id}.json`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    } catch { continue; }
    const after = await readFile(join(root, "servers", `${id}.json`), "utf8").then((t) => JSON.parse(t) as ServerJson, () => null);
    if (before.$schema && after) out.push(...versionErrors(before, after));
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  const catalog = await buildCatalog(root, "dev");
  console.log(`${catalog.servers.length + catalog.natives.length} entradas válidas (${catalog.servers.length} MCP, ${catalog.natives.length} gatekeepers nativos)`);
  const i = process.argv.indexOf("--probe");
  if (i !== -1) {
    const base = process.argv[i + 1];
    const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
    let failed = false;
    for (const m of await versionCheck(root, base, changedIds(files))) { console.log(`MAL ${m}`); failed = true; }
    for (const id of changedIds(files)) {
      const s = catalog.servers.find((x) => x.id === id);
      if (!s) continue; // la entrada se borró
      if (!probeable(s)) { console.log(`--  ${id} ${s.url}: con hueco, no se prueba`); continue; }
      const r = await probe(s.url);
      console.log(`${r.ok ? "ok " : "MAL"} ${id} ${s.url}: ${r.detail}`);
      failed ||= !r.ok;
    }
    if (failed) process.exit(1);
  }
}
