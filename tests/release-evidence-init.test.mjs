import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildPendingManifest,
  initializeEvidence,
} from "../scripts/release-evidence-init.mjs";
import { evaluate } from "../scripts/release-evidence-check.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = fileURLToPath(
  new URL("../scripts/release-evidence-init.mjs", import.meta.url)
);
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "axes-rc-init-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("pending initializer refuses missing or malformed inputs before writing", async t => {
  const dir = await fixture(t);
  for (const invalid of [
    { sha: "bad", runId: "123" },
    { sha, runId: "abc" },
    { sha: "a".repeat(40), runId: "123" },
  ]) {
    await assert.rejects(
      initializeEvidence({ dir: join(dir, "invalid"), ...invalid }),
      /RC_EVIDENCE_/
    );
  }
  const result = spawnSync(process.execPath, [command], {
    cwd: root,
    encoding: "utf8",
    timeout: 3000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /RC_EVIDENCE_ARGUMENTS_REQUIRED/);
});

test("generated index is private, bound to checkout, and always NO-GO", async t => {
  const dir = await fixture(t);
  const target = join(dir, "checkpoint");
  const result = await initializeEvidence({ dir: target, sha, runId: "123456" });
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.equal(manifest.candidate.sha, sha);
  assert.equal(manifest.candidate.ciHeadSha, sha);
  assert.equal(
    manifest.candidate.ciRunUrl,
    "https://github.com/jeffaxe81/crm-vendas/actions/runs/123456"
  );
  assert.equal(manifest.candidate.ciEvent, "push");
  assert.equal(manifest.candidate.ciConclusion, "success");
  assert.equal(result.ciRunClaimVerified, false);
  assert.equal(result.externalChecksExecuted, false);
  assert.equal(result.productionApproved, false);
  assert.equal(result.status, "PENDING_NO_GO");
  assert.ok(Object.values(manifest.evidence).every(item => item.status === "pending"));
  assert.equal((await stat(target)).mode & 0o777, 0o700);
  assert.equal((await stat(result.manifestPath)).mode & 0o777, 0o600);
  const checked = await evaluate(result.manifestPath, sha);
  assert.equal(checked.status, "NO_GO");
  assert.equal(checked.productionApproved, false);
  assert.ok(checked.errors.some(error => error.includes("serverDiagnostics")));
});

test("initializer never overwrites an existing package", async t => {
  const dir = await fixture(t);
  const target = join(dir, "checkpoint");
  await initializeEvidence({ dir: target, sha, runId: "123456" });
  const path = join(target, "manifest.json");
  const before = await readFile(path, "utf8");
  await assert.rejects(
    initializeEvidence({ dir: target, sha, runId: "123456" }),
    /EEXIST/
  );
  assert.equal(await readFile(path, "utf8"), before);
});

test("initializer refuses unignored paths inside source checkout", async () => {
  await assert.rejects(
    initializeEvidence({
      dir: join(root, "docs", "unexpected-evidence-folder"),
      sha,
      runId: "123456",
    }),
    /RC_EVIDENCE_DIR_MUST_BE_PRIVATE/
  );
});

test("manifest builder never treats the CI claim as real approval", () => {
  const template = {
    schemaVersion: 1,
    candidate: {},
    evidence: Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [
        "field" + i,
        { file: "evidence/test" + i + ".txt", status: "passed" },
      ])
    ),
  };
  const result = buildPendingManifest(template, sha, "42");
  assert.ok(Object.values(result.evidence).every(item => item.status === "pending"));
  assert.ok(Object.values(template.evidence).every(item => item.status === "passed"));
});
