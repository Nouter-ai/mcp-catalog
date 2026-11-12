import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { CATEGORIES, directoryMetaErrors } from "./directory.ts";

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
