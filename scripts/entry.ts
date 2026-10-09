// Las reglas de una entrada del catálogo (docs/yunta/catalogo-mcp.md en Nouter-ai/nouter). yunta-control las repite
// en src/catalogo-mcp.ts: si cambian acá, cambian allá.

export interface Entry {
  id: string; registry?: string; url: string; name: string; landing?: { es: string }; color: string;
  tagline: string; description: string; settings: { field: string; variable: "MCP_FIXED_CLIENT_ID" }[]; trustedLogin: string[];
}

// Los gatekeepers que siguen en el código de yunta-control. "mcp-" es el prefijo de los MCP propios de cada empresa.
export const RESERVED = ["context", "scheduler", "mcp", "google", "slack", "github"] as const;

const KEYS = new Set(["id", "registry", "url", "name", "landing", "color", "tagline", "description", "settings", "trustedLogin"]);
const BLOCKED = [/^localhost$/i, /\.localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./, /^\[?::1\]?$/, /^\[?f[cd][0-9a-f]{2}:/i, /^metadata\./i, /\.internal$/i];
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function checkUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return "url: no es una URL"; }
  if (u.protocol !== "https:") return "url: tiene que ser https";
  if (u.username || u.password) return "url: no puede llevar credenciales";
  if (u.hash) return "url: no puede llevar fragmento";
  if (BLOCKED.some((p) => p.test(u.hostname))) return "url: el host es privado";
  return null;
}

const text = (v: unknown, max: number) => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= max;

export function checkEntry(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return ["la entrada tiene que ser un objeto"];
  const e = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const k of Object.keys(e)) if (!KEYS.has(k)) errors.push(`clave desconocida: ${k}`);
  const id = e.id;
  if (typeof id !== "string" || !/^[a-z][a-z0-9-]{0,19}$/.test(id)) errors.push("id: minúsculas, letras, números y guiones, hasta 20");
  else if ((RESERVED as readonly string[]).includes(id) || id.startsWith("mcp-")) errors.push(`id: ${id} está reservado`);
  if (e.registry !== undefined && (typeof e.registry !== "string" || !/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(e.registry))) {
    errors.push("registry: el nombre del registro oficial, como com.notion/mcp");
  }
  if (typeof e.url !== "string") errors.push("url: falta");
  else { const err = checkUrl(e.url); if (err) errors.push(err); }
  if (!text(e.name, 40)) errors.push("name: obligatorio, hasta 40");
  if (!text(e.tagline, 60)) errors.push("tagline: obligatorio, hasta 60");
  if (!text(e.description, 300)) errors.push("description: obligatoria, hasta 300");
  if (typeof e.color !== "string" || !/^#[0-9A-F]{6}$/.test(e.color)) errors.push("color: #RRGGBB en mayúsculas");
  if (e.landing !== undefined) {
    const l = e.landing as Record<string, unknown>;
    if (typeof l !== "object" || l === null || Object.keys(l).join() !== "es" || !text(l.es, 80)) errors.push("landing: { es } hasta 80");
  }
  if (!Array.isArray(e.settings)) errors.push("settings: tiene que ser una lista");
  else for (const s of e.settings as Record<string, unknown>[]) {
    if (typeof s !== "object" || s === null || Object.keys(s).toSorted().join() !== "field,variable"
      || typeof s.field !== "string" || !/^[a-zA-Z]{1,30}$/.test(s.field) || s.variable !== "MCP_FIXED_CLIENT_ID") {
      errors.push("settings: cada uno { field, variable: \"MCP_FIXED_CLIENT_ID\" }");
    }
  }
  if (!Array.isArray(e.trustedLogin) || !e.trustedLogin.every((h) => typeof h === "string" && HOST.test(h))) {
    errors.push("trustedLogin: una lista de dominios, como github.com");
  }
  return errors;
}
