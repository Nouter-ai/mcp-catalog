// La conversión entre una entrada del Directory (scripts/entry.ts) y un server.json del MCP Registry
// (schema/vendor/server.schema.json). Lo de Nouter va en _meta["ai.nouter.directory"]; el estándar no tiene dónde.
// Puras y en los dos sentidos: toEntry(toServerJson(e)) es e.

import type { DirectoryMeta } from "./directory-meta.ts";
import type { Entry, Setting } from "./entry.ts";

export const NS = "ai.nouter.directory";
export const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
// Los archivos de servers/ que no son entradas.
export const NOT_ENTRIES = ["order.json", "added-baseline.json"];
const OWN = "ai.nouter/";
const HOLE = /\{([^}]*)\}/g;

export interface Remote { type: "streamable-http"; url: string; variables?: Record<string, { description: string; isRequired: boolean }> }
export type NouterMeta = { id: string; description: string; color: string; landing?: { es: string }; settings: Setting[]; trustedLogin: string[] } & Partial<DirectoryMeta>;
export interface ServerJson {
  $schema: string; name: string; title: string; description: string; version: string; remotes: Remote[];
  _meta: Record<string, NouterMeta>;
}

export function toServerJson(e: Entry, version = "1.0.0", directory?: DirectoryMeta): ServerJson {
  const holes = [...e.url.matchAll(HOLE)].map((m) => m[1]);
  const remote: Remote = { type: "streamable-http", url: e.url };
  if (holes.length) remote.variables = Object.fromEntries(holes.map((h) => [h, { description: h, isRequired: true }]));
  const meta: NouterMeta = { id: e.id, description: e.description, color: e.color,
    ...(e.landing ? { landing: e.landing } : {}),
    settings: e.settings.filter((s) => !("fills" in s)), trustedLogin: e.trustedLogin, ...directory };
  return { $schema: SCHEMA_URL, name: e.registry ?? `${OWN}${e.id}`, title: e.name, description: e.tagline, version,
    remotes: [remote], _meta: { [NS]: meta } };
}

export function toEntry(s: ServerJson): Entry {
  const m = s._meta[NS];
  const remote = s.remotes[0];
  const fills: Setting[] = Object.keys(remote.variables ?? {}).map((field) => ({ field, fills: "url" as const }));
  return { id: m.id, ...(s.name.startsWith(OWN) ? {} : { registry: s.name }), url: remote.url, name: s.title,
    ...(m.landing ? { landing: m.landing } : {}), color: m.color, tagline: s.description, description: m.description,
    settings: [...fills, ...m.settings], trustedLogin: m.trustedLogin };
}
