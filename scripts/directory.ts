// Los datos de la vidriera de cada entrada del Directory (docs/nouter/producto/conectores/nouter-directory.md): los temas, quién
// la publica, si está verificada y cómo se entra. Viven en _meta["ai.nouter.directory"] de cada server.json.
// La lista de temas es idéntica en schema/categories.json, en plugin-catalog y en @yunta/ui.

export const CATEGORY_LABELS = [
  { id: "automation-workflows", label: "Automation & workflows" },
  { id: "contacts-leads", label: "Contacts & leads" },
  { id: "databases", label: "Databases" },
  { id: "design-media", label: "Design & media" },
  { id: "email-messages", label: "Email & messages" },
  { id: "engineering", label: "Engineering" },
  { id: "events-tickets", label: "Events & tickets" },
  { id: "files-documents", label: "Files & documents" },
  { id: "finance", label: "Finance" },
  { id: "legal", label: "Legal" },
  { id: "logs-errors", label: "Logs & errors" },
  { id: "marketing", label: "Marketing" },
  { id: "notes-memory", label: "Notes & memory" },
  { id: "reference-docs", label: "Reference docs" },
  { id: "retail-ecommerce", label: "Retail & e-commerce" },
  { id: "sales", label: "Sales" },
  { id: "tickets-tasks", label: "Tickets & tasks" },
  { id: "websites", label: "Websites" },
] as const;

export type DirectoryCategory = (typeof CATEGORY_LABELS)[number]["id"];
export const CATEGORIES: readonly DirectoryCategory[] = CATEGORY_LABELS.map((c) => c.id);
export type SignIn = "account" | "company" | "none";
export const SIGN_INS: readonly SignIn[] = ["account", "company", "none"];
export interface DirectoryMeta { categories: DirectoryCategory[]; publisher: string; verified: boolean; signIn: SignIn }

// Valida los campos de la vidriera y rechaza toda clave que no esté en `allowed` (las del resto de la entrada incluidas).
export function directoryMetaErrors(meta: Record<string, unknown>, allowed: readonly string[]): string[] {
  const errors: string[] = [];
  for (const k of Object.keys(meta)) if (!allowed.includes(k)) errors.push(`_meta: clave desconocida ${k}`);
  const c = meta.categories;
  if (!Array.isArray(c) || c.length < 1 || c.length > 3 || new Set(c).size !== c.length || !c.every((x) => CATEGORIES.includes(x as DirectoryCategory))) {
    errors.push("categories: de 1 a 3 temas distintos de la lista cerrada (schema/categories.json)");
  }
  if (typeof meta.publisher !== "string" || meta.publisher.length < 1 || meta.publisher.length > 40) errors.push("publisher: de 1 a 40 caracteres");
  if (typeof meta.verified !== "boolean") errors.push("verified: true o false");
  if (!SIGN_INS.includes(meta.signIn as SignIn)) errors.push("signIn: account, company o none");
  return errors;
}
