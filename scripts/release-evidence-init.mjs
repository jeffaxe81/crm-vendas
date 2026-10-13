#!/usr/bin/env node
/**
 * Initialize a private, pending-only RC evidence index for an existing checkout.
 * Does not run deployment, inspect the server, verify GitHub, or approve release.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, realpath, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHA = /^[a-f0-9]{40}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const repo = "jeffaxe81/crm-vendas";
const templatePath = resolve(
  root,
  "docs/releases/crm-rc-evidence-template.json"
);

function within(parent, child) {
  const rel = relative(parent, child);
  return (
    rel === "" || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel))
  );
}

export function buildPendingManifest(template, sha, runId) {
  if (!SHA.test(sha ?? "") || !RUN_ID.test(runId ?? "")) {
    throw new Error("RC_EVIDENCE_INVALID_ID");
  }
  if (
    template?.schemaVersion !== 1 ||
    !template.candidate ||
    !template.evidence ||
    Object.keys(template.evidence).length !== 9
  ) {
    throw new Error("RC_EVIDENCE_TEMPLATE_INVALID");
  }
  const manifest = structuredClone(template);
  manifest.candidate = {
    sha,
    ciHeadSha: sha,
    ciEvent: "push",
    ciConclusion: "success",
    ciRunUrl: "https://github.com/" + repo + "/actions/runs/" + runId,
  };
  for (const item of Object.values(manifest.evidence)) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.file !== "string" ||
      !item.file.startsWith("evidence/")
    ) {
      throw new Error("RC_EVIDENCE_TEMPLATE_INVALID");
    }
    item.status = "pending";
  }
  return manifest;
}

export async function initializeEvidence({ dir, sha, runId }) {
  // Validate all identifiers and confirm the local checkout BEFORE creating files.
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const manifest = buildPendingManifest(template, sha, runId);
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (sourceSha !== sha) throw new Error("RC_EVIDENCE_CHECKOUT_SHA_MISMATCH");
  if (typeof dir !== "string" || !dir.trim()) {
    throw new Error("RC_EVIDENCE_DIR_REQUIRED");
  }
  const destination = resolve(dir);
  // Never accidentally write unignored operational evidence inside the repo.
  if (
    within(root, destination) &&
    !within(join(root, "rc-evidence"), destination)
  ) {
    throw new Error("RC_EVIDENCE_DIR_MUST_BE_PRIVATE");
  }
  if (destination === resolve(root, "rc-evidence")) {
    throw new Error("RC_EVIDENCE_USE_NEW_SUBDIRECTORY");
  }
  // Reject a symlink parent: evidence should not be redirected on creation.
  if ((await realpath(dirname(destination))) !== dirname(destination)) {
    throw new Error("RC_EVIDENCE_SYMLINK_PARENT");
  }
  await mkdir(destination, { mode: 0o700 });
  try {
    await writeFile(
      join(destination, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
  } catch (error) {
    await rmdir(destination);
    throw error;
  }
  return {
    kind: "CRM_RC_EVIDENCE_INDEX_INITIALIZED",
    status: "PENDING_NO_GO",
    checkoutSha: sourceSha,
    manifestPath: join(destination, "manifest.json"),
    ciRunClaimVerified: false,
    externalChecksExecuted: false,
    productionApproved: false,
  };
}

function readArguments(argv) {
  if (argv.length !== 6) throw new Error("RC_EVIDENCE_ARGUMENTS_REQUIRED");
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!["--dir", "--sha", "--ci-run-id"].includes(key) || args.has(key)) {
      throw new Error("RC_EVIDENCE_ARGUMENTS_INVALID");
    }
    args.set(key, argv[i + 1]);
  }
  if (args.size !== 3) throw new Error("RC_EVIDENCE_ARGUMENTS_REQUIRED");
  return {
    dir: args.get("--dir"),
    sha: args.get("--sha"),
    runId: args.get("--ci-run-id"),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await initializeEvidence(
      readArguments(process.argv.slice(2))
    );
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    // Do not echo potentially sensitive paths, CI text, or local environment.
    process.stderr.write(
      error instanceof Error && error.message.startsWith("RC_EVIDENCE_")
        ? error.message + "\n"
        : "RC_EVIDENCE_INITIALIZATION_FAILED\n"
    );
    process.exitCode = 2;
  }
}
