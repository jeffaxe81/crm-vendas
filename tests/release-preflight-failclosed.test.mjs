import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = [
  "scripts/release-preflight.mjs",
  "apps/api/src/messaging/email/email.module.ts",
  "compose.yaml",
  "scripts/verificar-deploy.sh",
  "scripts/smoke-externo-c12.sh",
  ".github/workflows/ci.yml",
  "docs/deploy/deploy-https.md",
];

function preflight(change) {
  const directory = mkdtempSync(join(tmpdir(), "crm-rc-preflight-"));
  try {
    for (const relative of required) {
      const target = join(directory, relative);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(root, relative), target);
    }
    if (change) {
      const file = join(directory, change.path);
      const source = readFileSync(file, "utf8");
      const edited = change.mutate(source);
      assert.notEqual(edited, source, "Mutation must change the fixture");
      writeFileSync(file, edited);
    }
    const result = spawnSync(
      process.execPath,
      [join(directory, "scripts/release-preflight.mjs"), "--json"],
      { encoding: "utf8", timeout: 10000, cwd: directory }
    );
    assert.equal(result.error, undefined);
    const report = JSON.parse(result.stdout);
    return { result, report };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("RC preflight accepts code safeguards but never authorizes production", () => {
  const { result, report } = preflight();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.kind, "CRM_CODE_PREFLIGHT");
  assert.equal(report.status, "CODE_CHECKS_PASSED");
  assert.equal(report.productionApproved, false);
  assert.deepEqual(report.errors, []);
  assert.ok(report.operationalChecksPending.length >= 5);
});

const tampering = [
  {
    name: "external email transport activated",
    path: "apps/api/src/messaging/email/email.module.ts",
    mutate: code =>
      code.replace(
        "useClass: DisabledEmailProvider",
        "useClass: ActiveEmailProvider"
      ),
  },
  {
    name: "webhook worker enabled by default",
    path: "compose.yaml",
    mutate: code =>
      code.replace(
        "${WEBHOOK_WORKER_ENABLED:-false}",
        "${WEBHOOK_WORKER_ENABLED:-true}"
      ),
  },
  {
    name: "database exposed on all interfaces by default",
    path: "compose.yaml",
    mutate: code =>
      code.replace(
        "${BIND_ADDRESS:-127.0.0.1}:5432",
        "${BIND_ADDRESS:-0.0.0.0}:5432"
      ),
  },
  {
    name: "migration readiness dependency removed",
    path: "compose.yaml",
    mutate: code =>
      code.replace(
        "condition: service_completed_successfully",
        "condition: service_started"
      ),
  },
  {
    name: "external HTTPS trust evidence omitted",
    path: "scripts/smoke-externo-c12.sh",
    mutate: code => code.replaceAll("CA_CERT", "NO_TRUST_ANCHOR"),
  },
  {
    name: "browser E2E gate omitted",
    path: ".github/workflows/ci.yml",
    mutate: code =>
      code.replace("Run end-to-end test", "Browser test skipped"),
  },
  {
    name: "rollback approval removed from deploy guide",
    path: "docs/deploy/deploy-https.md",
    mutate: code => code.replaceAll("Rollback", "Recovery pending"),
  },
];

for (const scenario of tampering) {
  test(`RC preflight fails closed when ${scenario.name}`, () => {
    const { result, report } = preflight(scenario);
    assert.equal(result.status, 1, scenario.name);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.productionApproved, false);
    assert.ok(report.errors.length >= 1, scenario.name);
    assert.ok(report.operationalChecksPending.length >= 5);
  });
}
