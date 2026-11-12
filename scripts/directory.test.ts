import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BASELINE_IDS, baselineErrors, buildDirectory, CATEGORIES, checkFeatured, directoryMetaErrors, gitAddedAt } from "./directory.ts";
import { toServerJson } from "./server-json.ts";

const root = new URL("..", import.meta.url).pathname;

test("schema/categories.json es la lista del contrato: 18, con id y rótulo", async () => {
  const s = JSON.parse(await readFile(new URL("../schema/categories.json", import.meta.url), "utf8"));
  assert.deepEqual(s.categories.map((c: any) => c.id), CATEGORIES);
  assert.equal(CATEGORIES.length, 18);
  assert.equal(s.categories[0].label, "Automation & workflows");
});

test("las entradas conocidas de servers/ declaran categorías, publisher, verified y signIn como la tabla (una nueva no rompe el test: la valida server-check)", async () => {
  const files = (await readdir(new URL("../servers", import.meta.url))).filter((f) => f.endsWith(".json") && f !== "order.json" && f !== "added-baseline.json");
  const tabla: Record<string, [string[], string, boolean, string]> = {
    notion: [["notes-memory", "reference-docs"], "Notion", true, "account"],
    linear: [["engineering", "tickets-tasks"], "Linear", true, "account"],
    atlassian: [["engineering", "tickets-tasks"], "Atlassian", true, "account"],
    cloudflare: [["engineering", "websites"], "Cloudflare", true, "account"],
    supabase: [["databases", "engineering"], "Supabase", true, "account"],
    stripe: [["finance", "retail-ecommerce"], "Stripe", true, "account"],
    twenty: [["sales", "contacts-leads"], "Twenty", true, "account"],
    salesforce: [["sales", "contacts-leads"], "Salesforce", true, "account"],
    netsuite: [["finance", "databases"], "Oracle NetSuite", true, "account"],
    emdash: [["websites", "design-media"], "Cloudflare", true, "account"],
    "nouter-sor": [["databases", "reference-docs"], "Nouter", true, "account"],
    eset: [["engineering", "logs-errors"], "ESET", true, "company"],
    hexnode: [["engineering", "tickets-tasks"], "Hexnode", true, "company"],
    github: [["engineering", "tickets-tasks"], "GitHub", true, "account"],
    google: [["email-messages", "files-documents"], "Google", true, "account"],
    slack: [["email-messages"], "Slack", true, "account"],
    gitlab: [["engineering", "tickets-tasks"], "GitLab", true, "account"],
    microsoft: [["email-messages", "files-documents"], "Microsoft", true, "account"],
    zoominfo: [["contacts-leads", "sales"], "ZoomInfo", true, "account"],
    spotify: [["design-media"], "Spotify", true, "account"],
    x: [["marketing", "design-media"], "X", true, "account"],
    homeassistant: [["automation-workflows", "engineering"], "Home Assistant", true, "company"],
    "mcp-portal": [["engineering", "automation-workflows"], "Cloudflare", true, "company"],
    email: [["email-messages"], "Cloudflare", true, "none"],
    control: [["engineering", "finance"], "Nouter", true, "account"],
    delivery: [["engineering", "sales"], "Nouter", true, "company"],
  };
  const vistos = new Set<string>();
  for (const f of files) {
    const m = JSON.parse(await readFile(new URL(`../servers/${f}`, import.meta.url), "utf8"))._meta["ai.nouter.directory"];
    if (!tabla[m.id]) continue; // un conector que se suma después no está en la tabla
    vistos.add(m.id);
    assert.deepEqual([m.categories, m.publisher, m.verified, m.signIn], tabla[m.id], m.id);
  }
  assert.deepEqual([...vistos].toSorted(), Object.keys(tabla).toSorted(), "ninguno de los de hoy se perdió");
});

test("directoryMetaErrors: lo válido pasa y cada campo mal puesto falla con su nombre", () => {
  const ok = { categories: ["sales"], publisher: "Nouter", verified: true, signIn: "account" };
  const permitidas = [...Object.keys(ok), "id", "description", "color", "landing", "settings", "trustedLogin"];
  assert.deepEqual(directoryMetaErrors(ok, permitidas), []);
  const falla = (cambio: Record<string, unknown>, re: RegExp) => assert.match(directoryMetaErrors({ ...ok, ...cambio }, permitidas).join(" | "), re);
  falla({ categories: [] }, /categories/);
  falla({ categories: ["sales", "sales"] }, /categories/);
  falla({ categories: ["sales", "legal", "finance", "databases"] }, /categories/);
  falla({ categories: ["otra"] }, /categories/);
  falla({ publisher: "x".repeat(41) }, /publisher/);
  falla({ publisher: "" }, /publisher/);
  falla({ verified: "sí" }, /verified/);
  falla({ signIn: "otro" }, /signIn/);
  falla({ extra: 1 }, /desconocida/);
  assert.match(directoryMetaErrors({ publisher: "N", verified: true, signIn: "none" }, permitidas).join(), /categories/);
});

test("el índice: las 26, con tipo, categorías, added y logo; el nativo sin descripción larga", async () => {
  const idx = await buildDirectory(root, "v14", () => "2026-01-01T00:00:00Z");
  assert.equal(idx.repo, "mcp-catalog");
  assert.equal(idx.version, "v14");
  assert.deepEqual(idx.entries.map((e) => e.id), JSON.parse(await readFile(new URL("../servers/order.json", import.meta.url), "utf8")));
  const notion = idx.entries.find((e) => e.id === "notion")!;
  assert.equal(notion.type, "connector");
  assert.equal(notion.tagline, "Pages, databases and comments");
  assert.ok(notion.logo!.startsWith("data:image/svg+xml,"));
  assert.deepEqual(notion.connector, { kind: "mcp", signIn: "account" });
  assert.equal(notion.added, "2026-10-03T23:05:35.000Z", "la del baseline, no la del historial");
  const email = idx.entries.find((e) => e.id === "email")!;
  assert.deepEqual(email.connector, { kind: "native", signIn: "none" });
  assert.equal(email.offered, false);
  assert.equal(email.description, "A mailbox for each gadget");
  assert.equal(idx.featured[0].id, "sales-essentials");
});

test("un destacado que nombra un id que no existe, repite una colección o deja un título vacío falla", () => {
  assert.match(checkFeatured({ collections: [{ id: "a", title: "A", subtitle: "s", items: ["nada"] }] }, new Map([["notion", {}]])).join(), /items/);
  assert.match(checkFeatured({ collections: [{ id: "a", title: "", subtitle: "s", items: ["notion"] }] }, new Map([["notion", {}]])).join(), /title/);
  const dos = [{ id: "a", title: "A", subtitle: "s", items: ["notion"] }];
  assert.match(checkFeatured({ collections: [...dos, ...dos] }, new Map([["notion", {}]])).join(), /repetid/);
});

test("added sale del primer commit que agregó la entrada", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dir-added-"));
  await mkdir(join(dir, "servers")); await mkdir(join(dir, "logos"));
  const e = { id: "uno", url: "https://a.example.com/mcp", name: "Uno", color: "#FFFFFF", tagline: "t", description: "d", settings: [], trustedLogin: [] };
  const meta = { categories: ["engineering" as const], publisher: "Ej", verified: true, signIn: "account" as const };
  await writeFile(join(dir, "servers/uno.json"), JSON.stringify(toServerJson(e, "1.0.0", meta)));
  await writeFile(join(dir, "servers/order.json"), JSON.stringify(["uno"]));
  await writeFile(join(dir, "logos/uno.svg"), "<svg/>");
  await writeFile(join(dir, "featured.json"), JSON.stringify({ collections: [] }));
  const env = { ...process.env, GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=a@b.c", "-c", "user.name=t", ...a], { cwd: dir, stdio: "ignore", env });
  git("init", "-q", "-b", "main"); git("add", "."); git("commit", "-qm", "base");
  // Un cambio posterior no mueve la fecha: cuenta el commit que la agregó.
  await writeFile(join(dir, "servers/uno.json"), JSON.stringify({ ...toServerJson(e, "1.0.1", meta) }));
  execFileSync("git", ["-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-qam", "cambio"], { cwd: dir, stdio: "ignore",
    env: { ...env, GIT_AUTHOR_DATE: "2026-03-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-03-01T00:00:00Z" } });
  const idx = await buildDirectory(dir, "v1", gitAddedAt(dir));
  assert.equal(idx.entries[0].added, "2026-01-01T00:00:00.000Z");
});

test("el release publica directory.json y corre con el historial completo", async () => {
  const y = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  assert.match(y, /fetch-depth: 0/);
  assert.match(y, /dist\/directory\.json/);
});

test("sin importaciones circulares: lo que directory.ts importa no lo importa a él; los tipos y las reglas de los campos viven en un módulo hoja", async () => {
  const src = (f: string) => readFile(new URL(`./${f}`, import.meta.url), "utf8");
  for (const f of ["native.ts", "server-check.ts", "server-json.ts", "entry.ts", "logo.ts"]) assert.doesNotMatch(await src(f), /from "\.\/directory\.ts"/, f);
  const leaf = await src("directory-meta.ts");
  assert.doesNotMatch(leaf, /from "\.\//, "directory-meta.ts no importa nada de este repo");
  assert.match(leaf, /export function directoryMetaErrors/);
  assert.match(leaf, /export const CATEGORIES/);
});

test("un destacado no puede nombrar una entrada con flag ni con offered: false: el tenant que no la tiene vería la colección rota", async () => {
  const entradas = new Map<string, { flag?: string; offered?: boolean }>([["notion", {}], ["gitlab", { flag: "directory-nativos" }], ["email", { offered: false }]]);
  const col = (...items: string[]) => ({ collections: [{ id: "a", title: "A", subtitle: "s", items }] });
  assert.deepEqual(checkFeatured(col("notion"), entradas), []);
  assert.match(checkFeatured(col("notion", "gitlab"), entradas).join(), /flag/);
  assert.match(checkFeatured(col("email"), entradas).join(), /offered/);
  // Y el featured.json real no nombra ninguna.
  const idx = await buildDirectory(root, "v1", () => "2026-01-01T00:00:00Z");
  const porId = new Map(idx.entries.map((e) => [e.id, e]));
  for (const c of idx.featured) for (const id of c.items) assert.ok(!porId.get(id)!.flag && porId.get(id)!.offered !== false, `${c.id}: ${id}`);
});

const HOY = ["notion", "linear", "atlassian", "cloudflare", "supabase", "stripe", "twenty", "salesforce", "netsuite", "emdash", "nouter-sor", "eset", "hexnode",
  "github", "google", "slack", "gitlab", "microsoft", "zoominfo", "spotify", "x", "homeassistant", "mcp-portal", "email", "control", "delivery"];

test("added-baseline.json: la fecha en que llegó a Nouter cada uno de los 26 de hoy; la lista es cerrada", async () => {
  const b = JSON.parse(await readFile(new URL("../servers/added-baseline.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(b).toSorted(), [...HOY].toSorted());
  assert.deepEqual([...BASELINE_IDS].toSorted(), [...HOY].toSorted());
  for (const [id, d] of Object.entries(b)) assert.match(d as string, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$/, id);
  assert.equal(b.notion, "2026-10-03T23:05:35.000Z");
  assert.equal(b.slack, "2026-10-05T13:50:25-03:00");
  assert.equal(b["nouter-sor"], "2026-11-03T00:54:38+00:00", "llegó como nouter-platform");
});

test("added: la fecha del baseline si el id está, y si no la del historial", async () => {
  const idx = await buildDirectory(root, "v1", () => "2030-01-01T00:00:00Z");
  assert.equal(idx.entries.find((e) => e.id === "notion")!.added, "2026-10-03T23:05:35.000Z");
  assert.ok(idx.entries.every((e) => e.added !== "2030-01-01T00:00:00Z"), "los 26 de hoy salen todos del baseline");
});

test("el baseline no puede crecer ni nombrar lo que no existe", async () => {
  const ok = "2026-10-03T23:05:35.000Z";
  assert.deepEqual(baselineErrors({ notion: ok }, new Set(["notion"])), []);
  assert.match(baselineErrors({ nuevo: ok }, new Set(["nuevo"])).join(), /cerrada/);
  assert.match(baselineErrors({ notion: ok }, new Set(["linear"])).join(), /no existe/);
  assert.match(baselineErrors({ notion: "ayer" }, new Set(["notion"])).join(), /fecha/);
  assert.match(baselineErrors([] as any, new Set()).join(), /objeto/);
  // En el armado: un id que no está en la lista cerrada rompe el release.
  const dir = await mkdtemp(join(tmpdir(), "dir-base-"));
  await mkdir(join(dir, "servers")); await mkdir(join(dir, "logos"));
  const e = { id: "uno", url: "https://a.example.com/mcp", name: "Uno", color: "#FFFFFF", tagline: "t", description: "d", settings: [], trustedLogin: [] };
  await writeFile(join(dir, "servers/uno.json"), JSON.stringify(toServerJson(e, "1.0.0", { categories: ["engineering"], publisher: "Ej", verified: true, signIn: "account" })));
  await writeFile(join(dir, "servers/order.json"), JSON.stringify(["uno"]));
  await writeFile(join(dir, "servers/added-baseline.json"), JSON.stringify({ uno: ok }));
  await writeFile(join(dir, "logos/uno.svg"), "<svg/>");
  await writeFile(join(dir, "featured.json"), JSON.stringify({ collections: [] }));
  await assert.rejects(buildDirectory(dir, "v1", () => "x"), /baseline.*cerrada|cerrada/);
});
