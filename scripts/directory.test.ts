import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildDirectory, CATEGORIES, checkFeatured, directoryMetaErrors, gitAddedAt } from "./directory.ts";
import { toServerJson } from "./server-json.ts";

const root = new URL("..", import.meta.url).pathname;

test("schema/categories.json es la lista del contrato: 18, con id y rótulo", async () => {
  const s = JSON.parse(await readFile(new URL("../schema/categories.json", import.meta.url), "utf8"));
  assert.deepEqual(s.categories.map((c: any) => c.id), CATEGORIES);
  assert.equal(CATEGORIES.length, 18);
  assert.equal(s.categories[0].label, "Automation & workflows");
});

test("cada entrada de servers/ declara categorías, publisher, verified y signIn como la tabla", async () => {
  const files = (await readdir(new URL("../servers", import.meta.url))).filter((f) => f.endsWith(".json") && f !== "order.json");
  assert.equal(files.length, 26);
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
    email: [["email-messages"], "Nouter", true, "none"],
    control: [["engineering", "finance"], "Nouter", true, "account"],
    delivery: [["sales", "tickets-tasks"], "Nouter", true, "company"],
  };
  for (const f of files) {
    const m = JSON.parse(await readFile(new URL(`../servers/${f}`, import.meta.url), "utf8"))._meta["ai.nouter.directory"];
    assert.deepEqual([m.categories, m.publisher, m.verified, m.signIn], tabla[m.id], m.id);
  }
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
  assert.equal(notion.added, "2026-01-01T00:00:00Z");
  const email = idx.entries.find((e) => e.id === "email")!;
  assert.deepEqual(email.connector, { kind: "native", signIn: "none" });
  assert.equal(email.offered, false);
  assert.equal(email.description, "A mailbox for each gadget");
  assert.equal(idx.featured[0].id, "sales-essentials");
});

test("un destacado que nombra un id que no existe, repite una colección o deja un título vacío falla", () => {
  assert.match(checkFeatured({ collections: [{ id: "a", title: "A", subtitle: "s", items: ["nada"] }] }, new Set(["notion"])).join(), /items/);
  assert.match(checkFeatured({ collections: [{ id: "a", title: "", subtitle: "s", items: ["notion"] }] }, new Set(["notion"])).join(), /title/);
  const dos = [{ id: "a", title: "A", subtitle: "s", items: ["notion"] }];
  assert.match(checkFeatured({ collections: [...dos, ...dos] }, new Set(["notion"])).join(), /repetid/);
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
  assert.equal(idx.entries[0].added, "2026-01-01T00:00:00+00:00");
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
