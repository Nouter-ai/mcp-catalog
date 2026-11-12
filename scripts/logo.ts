// El logo de cada entrada, como data URI (logos/<id>.svg). Lo usan el catálogo (build.ts) y el índice del Directory (directory.ts).

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// El mismo código que generó logos.ts en yunta-control: así los conectores de hoy no cambian.
export const logoUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;

export async function readLogo(dir: string, id: string): Promise<string> {
  let svg: string;
  try { svg = await readFile(join(dir, "logos", `${id}.svg`), "utf8"); } catch { throw new Error(`falta el logo logos/${id}.svg`); }
  if (!/^<svg[\s>/]/.test(svg.trim())) throw new Error(`logos/${id}.svg no es un SVG`);
  const uri = logoUri(svg);
  if (uri.length >= 5000) throw new Error(`logos/${id}.svg es muy grande (${uri.length} como data URI)`);
  return uri;
}
