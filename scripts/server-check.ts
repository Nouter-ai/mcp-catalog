// La validación de un server.json del Directory, en dos capas. Capa 1: el estándar (schema/vendor/server.schema.json,
// a mano para el subconjunto que usamos; los topes son los del esquema fijado) y las restricciones de Nouter sobre él.
// Capa 2: las reglas de Nouter de scripts/entry.ts sobre la entrada ya convertida. Devuelve los errores, [] si vale.

import { directoryMetaErrors } from "./directory-meta.ts";
import { checkEntry } from "./entry.ts";
import { checkNativeServerJson, isNative } from "./native.ts";
import { NS, SCHEMA_URL, toEntry, type ServerJson } from "./server-json.ts";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, min: number, max: number) => typeof v === "string" && v.length >= min && v.length <= max;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function layerStandard(s: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (s.$schema !== SCHEMA_URL) errors.push("$schema: tiene que ser el del esquema fijado (scripts/server-json.ts)");
  if (!str(s.name, 3, 200) || !/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(s.name as string)) errors.push("name: dominio en DNS inverso, una barra y un nombre (com.notion/mcp)");
  if (!str(s.description, 1, 100)) errors.push("description: de 1 a 100 caracteres (el estándar)");
  if (!str(s.title, 1, 100)) errors.push("title: de 1 a 100 caracteres");
  if (!str(s.version, 1, 255) || !SEMVER.test(s.version as string)) errors.push("version: obligatoria, semver exacto (1.0.0), sin rangos");
  const r = s.remotes;
  if (!Array.isArray(r) || r.length !== 1 || !isObj(r[0]) || r[0].type !== "streamable-http" || !str(r[0].url, 1, 2048)
    || (r[0].variables !== undefined && !isObj(r[0].variables))) {
    errors.push("remotes: exactamente uno, { type: \"streamable-http\", url, variables? }");
  }
  const m = s._meta;
  if (!isObj(m) || Object.keys(m).join() !== NS) {
    errors.push(`_meta: solo la clave ${NS}; las del registro oficial (io.modelcontextprotocol.registry/…) no se usan`);
  } else {
    const n = m[NS];
    if (!isObj(n) || !str(n.id, 1, 20) || !str(n.description, 1, 300) || !str(n.color, 7, 7)
      || (n.landing !== undefined && !(isObj(n.landing) && str(n.landing.es, 1, 80)))) errors.push(`_meta.${NS}: id, description, color y landing?`);
    else {
      if (n.nativeGatekeeper !== undefined && !(typeof n.nativeGatekeeper === "string" && /^gatekeeper-[a-z-]+$/.test(n.nativeGatekeeper))) {
        errors.push(`_meta.${NS}.nativeGatekeeper: el paquete del gatekeeper nativo de este servicio (gatekeeper-notion)`);
      }
      errors.push(...directoryMetaErrors(n, ["id", "description", "color", "landing", "settings", "trustedLogin", "nativeGatekeeper", "categories", "publisher", "verified", "signIn"]));
      if (!Array.isArray(n.settings)) errors.push(`_meta.${NS}.settings: tiene que ser una lista`);
      if (!Array.isArray(n.trustedLogin)) errors.push(`_meta.${NS}.trustedLogin: tiene que ser una lista`);
    }
  }
  return errors;
}

export function checkServerJson(raw: unknown): string[] {
  if (!isObj(raw)) return ["la entrada tiene que ser un objeto"];
  if (isNative(raw)) return checkNativeServerJson(raw);
  const e1 = layerStandard(raw);
  if (e1.length) return e1;
  return checkEntry(toEntry(raw as unknown as ServerJson));
}

// Cambiar la URL o la autenticación obliga a todos a reconectar (docs/nouter/producto/conectores/nouter-directory.md):
// tiene que verse en la versión. Compara una entrada con la de la base del PR.
export function versionErrors(base: ServerJson, head: ServerJson): string[] {
  const auth = (s: ServerJson) => JSON.stringify([s.remotes, s._meta[NS].settings, s._meta[NS].trustedLogin]);
  return auth(base) !== auth(head) && base.version === head.version
    ? [`version: cambió la URL o la autenticación de ${head.name} y la versión sigue en ${head.version}; subirla`] : [];
}
