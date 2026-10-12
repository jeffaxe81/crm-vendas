import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(
  new URL("../scripts/verificar-bundle-web.sh", import.meta.url)
);
const mockDocker = [
  "#!/usr/bin/env bash",
  '[[ "${MOCK_DOCKER_DOWN:-0}" != 1 ]] || exit 125',
  '[[ "$1" == compose && "$2" == exec && "$3" == -T && "$4" == web && "$5" == sh && "$6" == -c ]] || exit 98',
  'exec sh -c "$7"',
  "",
].join("\n");

function scan({
  bundle = "",
  hasDirectory = true,
  hasBundleFile = true,
  dockerDown = false,
  grepError = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "crm-bundle-scan-"));
  try {
    const docker = join(root, "docker");
    writeFileSync(docker, mockDocker);
    chmodSync(docker, 0o700);
    if (hasDirectory) {
      mkdirSync(join(root, ".next", "static"), { recursive: true });
      if (hasBundleFile) {
        writeFileSync(join(root, ".next", "static", "app.js"), bundle);
      }
    }
    if (grepError) {
      const grep = join(root, "grep");
      writeFileSync(grep, "#!/bin/sh\nexit 2\n");
      chmodSync(grep, 0o700);
    }
    return spawnSync("bash", [checker], {
      cwd: root,
      encoding: "utf8",
      timeout: 3000,
      env: {
        ...process.env,
        PATH: root + delimiter + process.env.PATH,
        MOCK_DOCKER_DOWN: dockerDown ? "1" : "0",
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("bundle inspection reports CLEAN only after an inspected directory has no unsafe URL", () => {
  const result = scan({ bundle: "https://127.0.0.1/api/v1" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "CLEAN");
});

test("bundle inspection detects mixed-content URLs", () => {
  const result = scan({ bundle: "http://localhost:3001/api/v1" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "UNSAFE");
});

test("bundle inspection fails closed when the web service is not available", () => {
  const result = scan({ dockerDown: true });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
});

test("bundle inspection fails closed when the static directory is missing", () => {
  const result = scan({ hasDirectory: false });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
});

test("bundle inspection fails closed when the static directory has no JavaScript bundle", () => {
  const result = scan({ hasBundleFile: false });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
});

test("bundle inspection fails closed on grep read or execution errors", () => {
  const result = scan({ grepError: true });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
});
