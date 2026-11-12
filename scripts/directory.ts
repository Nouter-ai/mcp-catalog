// El índice del Directory de conectores (directory.json de cada release): las entradas con sus datos, su logo y `added`, más los
// destacados. Los datos de la vidriera y sus reglas viven en directory-meta.ts.

import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readLogo } from "./logo.ts";
import { isNative, type NativeServerJson } from "./native.ts";
import { checkServerJson } from "./server-check.ts";
import { NS, type ServerJson } from "./server-json.ts";
import type { DirectoryCategory, SignIn } from "./directory-meta.ts";
export { CATEGORIES, CATEGORY_LABELS, SIGN_INS, directoryMetaErrors } from "./directory-meta.ts";
export type { DirectoryCategory, DirectoryMeta, SignIn } from "./directory-meta.ts";

// El índice de un release (el contrato de directory-discover): lo que yunta-control copia a su bundle.
export type DirectoryEntryType = "connector" | "plugin" | "skill" | "blueprint";
export interface FeaturedCollection { id: string; title: string; subtitle: string; items: string[] }
export interface DirectoryReleaseEntry {
  id: string; type: DirectoryEntryType; name: string; tagline: string; description: string; publisher: string; verified: boolean;
  categories: DirectoryCategory[]; added: string; logo?: string; flag?: string; offered?: boolean;
  connector?: { kind: "native" | "mcp"; signIn: SignIn }; path?: string; plugin?: string; skills?: string[]; license?: string;
  source?: { repo: string; commit: string };
}
export interface DirectoryReleaseIndex {
  repo: "mcp-catalog" | "plugin-catalog"; version: string; entries: DirectoryReleaseEntry[]; featured: FeaturedCollection[];
  banner?: { skills?: string; plugins?: string };
}

// featured.json: las colecciones del carrusel «Curated by Nouter». Cada id de item tiene que ser una entrada del catálogo.
export function checkFeatured(raw: unknown, entries: ReadonlyMap<string, { flag?: string; offered?: boolean }>): string[] {
  const errors: string[] = [];
  if (!(typeof raw === "object" && raw !== null && !Array.isArray(raw)) || !Array.isArray((raw as { collections?: unknown }).collections)) {
    return ["featured.json: { collections: [...] }"];
  }
  const keys = Object.keys(raw).filter((k) => k !== "collections");
  if (keys.length) errors.push(`featured.json: clave desconocida ${keys.join(", ")}`);
  const seen = new Set<string>();
  for (const [i, c] of ((raw as { collections: unknown[] }).collections).entries()) {
    const at = `collections[${i}]`;
    if (typeof c !== "object" || c === null || Array.isArray(c)) { errors.push(`${at}: tiene que ser un objeto`); continue; }
    const o = c as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!["id", "title", "subtitle", "items"].includes(k)) errors.push(`${at}: clave desconocida ${k}`);
    if (typeof o.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(o.id)) errors.push(`${at}.id: slug en minúsculas, hasta 40`);
    else if (seen.has(o.id)) errors.push(`${at}.id: ${o.id} repetido`);
    else seen.add(o.id);
    if (typeof o.title !== "string" || o.title.length < 1 || o.title.length > 40) errors.push(`${at}.title: de 1 a 40 caracteres`);
    if (typeof o.subtitle !== "string" || o.subtitle.length < 1 || o.subtitle.length > 80) errors.push(`${at}.subtitle: de 1 a 80 caracteres`);
    if (!Array.isArray(o.items) || o.items.length < 1) errors.push(`${at}.items: al menos un id`);
    else {
      if (new Set(o.items).size !== o.items.length) errors.push(`${at}.items: ids repetidos`);
      for (const it of o.items) {
        const e = typeof it === "string" ? entries.get(it) : undefined;
        if (!e) errors.push(`${at}.items: ${String(it)} no es una entrada del catálogo`);
        else if (e.flag) errors.push(`${at}.items: ${String(it)} está detrás del flag ${e.flag}: el tenant que no lo tiene vería la colección rota`);
        else if (e.offered === false) errors.push(`${at}.items: ${String(it)} es offered: false (no se ofrece)`);
      }
    }
  }
  return errors;
}

// La fecha del primer commit que agregó el archivo (la más vieja). Sin commit, falla: un release sale de commits.
export function gitAddedAt(root: string): (path: string) => string {
  return (path) => {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%cI", "--", path], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    if (!out.length) throw new Error(`${path}: no tiene un commit que lo agregue (added sale del historial de git)`);
    return out[out.length - 1];
  };
}

export async function buildDirectory(dir: string, version: string, addedOf: (path: string) => string): Promise<DirectoryReleaseIndex> {
  const files = (await readdir(join(dir, "servers"))).filter((f) => f.endsWith(".json") && f !== "order.json").toSorted();
  const byId = new Map<string, DirectoryReleaseEntry>();
  for (const f of files) {
    const raw = JSON.parse(await readFile(join(dir, "servers", f), "utf8")) as ServerJson | NativeServerJson;
    const errors = checkServerJson(raw);
    if (errors.length) throw new Error(`${f}: ${errors.join("; ")}`);
    const m = raw._meta[NS];
    const native = isNative(raw);
    const g = native ? (m as NativeServerJson["_meta"][string]).gatekeeper : undefined;
    byId.set(m.id, {
      id: m.id, type: "connector", name: raw.title, tagline: raw.description,
      // Un nativo no tiene descripción larga: su descripción es el tagline.
      description: native ? raw.description : (m as ServerJson["_meta"][string]).description,
      publisher: m.publisher!, verified: m.verified!, categories: m.categories!, added: addedOf(`servers/${f}`),
      logo: await readLogo(dir, m.id), ...(g?.flag ? { flag: g.flag } : {}), ...(g?.offered === false ? { offered: false } : {}),
      connector: { kind: native ? "native" : "mcp", signIn: m.signIn! },
    });
  }
  const order: unknown = JSON.parse(await readFile(join(dir, "servers", "order.json"), "utf8"));
  if (!Array.isArray(order) || order.length !== byId.size || new Set(order).size !== order.length || !order.every((id) => byId.has(id))) {
    throw new Error(`servers/order.json tiene que nombrar una vez a cada entrada: ${[...byId.keys()].join(", ")}`);
  }
  const featured: unknown = JSON.parse(await readFile(join(dir, "featured.json"), "utf8"));
  const featuredErrors = checkFeatured(featured, byId);
  if (featuredErrors.length) throw new Error(`featured.json: ${featuredErrors.join("; ")}`);
  return { repo: "mcp-catalog", version, entries: (order as string[]).map((id) => byId.get(id)!),
    featured: (featured as { collections: FeaturedCollection[] }).collections };
}
