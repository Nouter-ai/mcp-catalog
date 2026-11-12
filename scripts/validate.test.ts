import assert from "node:assert/strict";
import test from "node:test";
import { changedIds, probeable } from "./validate.ts";

test("changedIds toma solo las entradas tocadas", () => {
  assert.deepEqual(changedIds(["servers/notion.json", "servers/order.json", "servers/added-baseline.json", "logos/notion.svg", "README.md", "servers/stripe.json"]),
    ["notion", "stripe"]);
});

test("una entrada con hueco no se prueba: no hay un host de ejemplo que resuelva", () => {
  assert.equal(probeable({ url: "https://mcp.notion.com/mcp" }), true);
  assert.equal(probeable({ url: "https://{accountId}.suitetalk.api.netsuite.com/services/mcp/v1/all" }), false);
});

test("versionCheck: cambiar la URL sin subir la versión falla; subirla o cambiar otra cosa, no", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtemp, mkdir, readFile, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { versionCheck } = await import("./validate.ts");
  const dir = await mkdtemp(join(tmpdir(), "vc-"));
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=a@b.c", "-c", "user.name=t", ...a], { cwd: dir, stdio: "ignore" });
  await mkdir(join(dir, "servers"));
  const notion = JSON.parse(await readFile(new URL("../servers/notion.json", import.meta.url), "utf8"));
  const guardar = (s: unknown) => writeFile(join(dir, "servers/notion.json"), JSON.stringify(s));
  git("init", "-q", "-b", "main"); await guardar(notion); git("add", "."); git("commit", "-qm", "base");
  assert.deepEqual(await versionCheck(dir, "main", ["notion"]), []);
  await guardar({ ...notion, remotes: [{ ...notion.remotes[0], url: "https://mcp.notion.com/v2" }] });
  assert.match((await versionCheck(dir, "main", ["notion"])).join(), /version/);
  await guardar({ ...notion, version: "1.1.0", remotes: [{ ...notion.remotes[0], url: "https://mcp.notion.com/v2" }] });
  assert.deepEqual(await versionCheck(dir, "main", ["notion"]), []);
  assert.deepEqual(await versionCheck(dir, "main", ["nueva"]), []);
});
