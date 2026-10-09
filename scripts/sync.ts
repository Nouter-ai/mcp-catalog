// Compara las entradas que tienen "registry" con su última versión en el registro oficial de MCP. No cambia nada:
// escribe informes/registro.md con lo que hay que revisar, y el workflow abre el PR. No busca servidores nuevos.
// Uso: node scripts/sync.ts   (deja hay=true|false en $GITHUB_OUTPUT)

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEntries } from "./build.ts";
import type { Entry } from "./entry.ts";

export type Finding = { id: string; kind: "url-distinta" | "retirado" | "no-existe"; detail: string };

const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";

// El registro contesta en décimas de segundo, pero a veces una consulta se cuelga casi dos minutos (medido el
// 2026-10-09): cada una tiene 15 s y hasta 3 intentos. Si los tres fallan, el job falla.
async function pedir(url: string, fetchImpl: typeof fetch, esperaMs: number): Promise<Response> {
  let ultimo: unknown;
  for (let intento = 0; intento < 3; intento++) {
    if (intento) await new Promise((r) => setTimeout(r, esperaMs));
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
      if (res.status < 500) return res;
      ultimo = new Error(`el registro respondió ${res.status}`);
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo;
}

export async function checkEntries(entries: Entry[], fetchImpl: typeof fetch = fetch, esperaMs = 5000): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const e of entries) {
    if (!e.registry) continue;
    const res = await pedir(`${REGISTRY}/${encodeURIComponent(e.registry)}/versions/latest`, fetchImpl, esperaMs);
    if (res.status === 404) { out.push({ id: e.id, kind: "no-existe", detail: `${e.registry} no está en el registro` }); continue; }
    if (!res.ok) throw new Error(`el registro respondió ${res.status} para ${e.registry}`);
    const body = await res.json() as { server: { version?: string; remotes?: { url: string }[] };
      _meta?: Record<string, { status?: string }> };
    const status = body._meta?.["io.modelcontextprotocol.registry/official"]?.status ?? "active";
    if (status !== "active") { out.push({ id: e.id, kind: "retirado", detail: `${e.registry} está ${status}` }); continue; }
    const urls = (body.server.remotes ?? []).map((r) => r.url);
    if (!urls.includes(e.url)) {
      out.push({ id: e.id, kind: "url-distinta",
        detail: `usamos ${e.url}; el registro (${body.server.version ?? "?"}) publica: ${urls.join(", ") || "ninguna"}` });
    }
  }
  return out;
}

const TITULO: Record<Finding["kind"], string> = { "url-distinta": "URL distinta", retirado: "Retirado", "no-existe": "No está en el registro" };

export function report(findings: Finding[], fecha: string): string | null {
  if (!findings.length) return null;
  const lineas = findings.map((f) => `- **${f.id}** (${TITULO[f.kind]}): ${f.detail}`);
  return [`# Novedades del registro oficial (${fecha})`, "",
    "Nada se cambió solo. Revisar cada punto y, si corresponde, cambiar la entrada en otro PR.", "",
    ...lineas, "",
    "**Cambiar la URL de un servidor obliga a todos los usuarios de cada tenant a reconectar ese conector** " +
    "(su Worker se recrea en la próxima actualización). Probarlo primero en `acme`.", ""].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  const md = report(await checkEntries(await readEntries(root)), new Date().toISOString().slice(0, 10));
  if (md) {
    await mkdir(join(root, "informes"), { recursive: true });
    await writeFile(join(root, "informes", "registro.md"), md);
  }
  console.log(md ?? "Sin novedades");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `hay=${md ? "true" : "false"}\n`);
}
