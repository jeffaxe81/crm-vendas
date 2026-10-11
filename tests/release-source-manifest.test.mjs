import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSourceManifest } from "../scripts/release-source-manifest.mjs";

const sourceSha = "a".repeat(40);
const sourceTreeSha = "b".repeat(40);
const env = {
  GITHUB_REPOSITORY: "jeffaxe81/crm-vendas",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/main",
  GITHUB_SHA: sourceSha,
  GITHUB_RUN_ID: "38163356312",
  GITHUB_RUN_ATTEMPT: "1",
};
const fileHashes = {
  "pnpm-lock.yaml": "c".repeat(64),
  "compose.yaml": "d".repeat(64),
  ".github/workflows/ci.yml": "e".repeat(64),
  "apps/api/Dockerfile": "f".repeat(64),
  "apps/web/Dockerfile": "0".repeat(64),
};
const valid = {
  env,
  sourceSha,
  sourceTreeSha,
  fileHashes,
  generatedAt: "2026-10-11T20:00:00.000Z",
};

test("release source manifest records only a verified main push", () => {
  const result = buildSourceManifest(valid);
  assert.equal(result.sourceCommitSha, sourceSha);
  assert.equal(result.sourceTreeSha, sourceTreeSha);
  assert.equal(result.classification, "SOURCE_ONLY_NOT_A_RELEASE");
  assert.equal(result.releaseIssued, false);
  assert.equal(result.imagesPublished, false);
  assert.equal(result.containerRegistryDigestProven, false);
  assert.equal(result.operationalApproval, false);
  assert.equal(
    result.ciRunUrl,
    "https://github.com/jeffaxe81/crm-vendas/actions/runs/38163356312/attempts/1"
  );
  assert.deepEqual(result.filesSha256, fileHashes);
  assert.doesNotMatch(JSON.stringify(result), /credential|access_token|password/i);
});

test("release source manifest rejects non-main events and forged HEAD", () => {
  const invalid = [
    { ...valid, env: { ...env, GITHUB_EVENT_NAME: "pull_request" } },
    { ...valid, env: { ...env, GITHUB_REF: "refs/heads/feature" } },
    { ...valid, env: { ...env, GITHUB_REPOSITORY: "attacker/fork" } },
    { ...valid, env: { ...env, GITHUB_SHA: "c".repeat(40) } },
    { ...valid, env: { ...env, GITHUB_RUN_ID: "1/../../malicious" } },
    { ...valid, env: { ...env, GITHUB_RUN_ATTEMPT: "0" } },
    { ...valid, sourceTreeSha: "not-a-sha" },
    { ...valid, generatedAt: "yesterday" },
    { ...valid, fileHashes: { ...fileHashes, "compose.yaml": "bad" } },
    { ...valid, fileHashes: { ...fileHashes, "extra.secret": "1".repeat(64) } },
  ];
  for (const input of invalid) {
    assert.throws(
      () => buildSourceManifest(input),
      /RC_SOURCE_MANIFEST_CONTEXT_REJECTED/
    );
  }
});
