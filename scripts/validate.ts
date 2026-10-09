// El CI: todas las entradas valen y el build pasa. Con --probe <ref>, prueba las URLs de las entradas que cambiaron
// respecto de <ref> (en un PR, la base). Uso: node scripts/validate.ts [--probe origin/main]

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./build.ts";
import { probe } from "./probe.ts";

export function changedIds(files: string[]): string[] {
  return files.flatMap((f) => { const m = /^servers\/([a-z0-9-]+)\.json$/.exec(f); return m && m[1] !== "order" ? [m[1]] : []; });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  const catalog = await buildCatalog(root, "dev");
  console.log(`${catalog.servers.length} entradas válidas`);
  const i = process.argv.indexOf("--probe");
  if (i !== -1) {
    const base = process.argv[i + 1];
    const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
    let failed = false;
    for (const id of changedIds(files)) {
      const s = catalog.servers.find((x) => x.id === id);
      if (!s) continue; // la entrada se borró
      const r = await probe(s.url);
      console.log(`${r.ok ? "ok " : "MAL"} ${id} ${s.url}: ${r.detail}`);
      failed ||= !r.ok;
    }
    if (failed) process.exit(1);
  }
}
