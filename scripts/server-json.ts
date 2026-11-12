// La conversión entre una entrada del Directory (scripts/entry.ts) y un server.json del MCP Registry
// (schema/vendor/server.schema.json). Lo de Nouter va en _meta["ai.nouter.directory"]; el estándar no tiene dónde.
// Puras y en los dos sentidos: toEntry(toServerJson(e)) es e.

import type { Entry, Setting } from "./entry.ts";

export const NS = "ai.nouter.directory";
export const SCHEMA_URL = "https://raw.githubusercontent.com/modelcontextprotocol/registry/15739da3285de712addeebbed093bf3e79893d35/docs/reference/server-json/draft/server.schema.json";
const OWN = "ai.nouter/";
const HOLE = /\{([^}]*)\}/g;

export interface Remote { type: "streamable-http"; url: string; variables?: Record<string, { description: string; isRequired: boolean }> }
export interface NouterMeta { id: string; description: string; color: string; landing?: { es: string }; settings: Setting[]; trustedLogin: string[] }
export interface ServerJson {
  $schema: string; name: string; title: string; description: string; version: string; remotes: Remote[];
  _meta: Record<string, NouterMeta>;
}

export function toServerJson(e: Entry, version = "1.0.0"): ServerJson {
  const holes = [...e.url.matchAll(HOLE)].map((m) => m[1]);
  const remote: Remote = { type: "streamable-http", url: e.url };
  if (holes.length) remote.variables = Object.fromEntries(holes.map((h) => [h, { description: h, isRequired: true }]));
  const meta: NouterMeta = { id: e.id, description: e.description, color: e.color,
    ...(e.landing ? { landing: e.landing } : {}),
    settings: e.settings.filter((s) => !("fills" in s)), trustedLogin: e.trustedLogin };
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
