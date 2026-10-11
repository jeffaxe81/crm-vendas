#!/usr/bin/env node
/**
 * Records source-only CI provenance for a main-branch push.
 * It never publishes a release, signs an image, or approves a deployment.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_REPOSITORY = "jeffaxe81/crm-vendas";
const SHA = /^[a-f0-9]{40}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const ATTEMPT = /^[1-9][0-9]{0,5}$/;
const FILES = [
  "pnpm-lock.yaml",
  "compose.yaml",
  ".github/workflows/ci.yml",
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
];

export function buildSourceManifest(input) {
  const { env, sourceSha, sourceTreeSha, fileHashes, generatedAt } = input;
  if (
    env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY ||
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    !SHA.test(env.GITHUB_SHA ?? "") ||
    !SHA.test(sourceSha) ||
    !SHA.test(sourceTreeSha) ||
    sourceSha !== env.GITHUB_SHA ||
    !RUN_ID.test(env.GITHUB_RUN_ID ?? "") ||
    !ATTEMPT.test(env.GITHUB_RUN_ATTEMPT ?? "") ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(generatedAt) ||
    Object.keys(fileHashes).length !== FILES.length ||
    FILES.some(path => !/^[a-f0-9]{64}$/.test(fileHashes[path] ?? ""))
  ) {
    throw new Error("RC_SOURCE_MANIFEST_CONTEXT_REJECTED");
  }
  return {
    schemaVersion: 1,
    kind: "CRM_SOURCE_CI_EVIDENCE",
    classification: "SOURCE_ONLY_NOT_A_RELEASE",
    sourceCommitSha: sourceSha,
    sourceTreeSha,
    sourceRef: "refs/heads/main",
    repository: EXPECTED_REPOSITORY,
    ciRunUrl:
      "https://github.com/" +
      EXPECTED_REPOSITORY +
      "/actions/runs/" +
      env.GITHUB_RUN_ID +
      "/attempts/" +
      env.GITHUB_RUN_ATTEMPT,
    generatedAt,
    filesSha256: Object.fromEntries(
      FILES.map(path => [path, fileHashes[path]])
    ),
    imagesPublished: false,
    containerRegistryDigestProven: false,
    operationalApproval: false,
    releaseIssued: false,
  };
}

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = process.env.CRM_SOURCE_MANIFEST_PATH;
  if (!output || !isAbsolute(output)) {
    throw new Error("RC_SOURCE_MANIFEST_OUTPUT_REJECTED");
  }
  if (git(root, "status", "--porcelain", "--untracked-files=no") !== "") {
    throw new Error("RC_SOURCE_MANIFEST_DIRTY_SOURCE");
  }
  const fileHashes = {};
  for (const path of FILES) {
    fileHashes[path] = createHash("sha256")
      .update(await readFile(resolve(root, path)))
      .digest("hex");
  }
  const manifest = buildSourceManifest({
    env: process.env,
    sourceSha: git(root, "rev-parse", "HEAD"),
    sourceTreeSha: git(root, "rev-parse", "HEAD^{tree}"),
    fileHashes,
    generatedAt: new Date().toISOString(),
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(manifest, null, 2) + "\n", {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    "CRM source evidence generated (not a release): " +
      manifest.sourceCommitSha +
      "\n"
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    // Never print environment variables, file contents or unexpected stack traces.
    process.stderr.write("RC_SOURCE_MANIFEST_GENERATION_FAILED\n");
    process.exitCode = 1;
  });
}
