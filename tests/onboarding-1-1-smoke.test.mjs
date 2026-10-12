import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/smoke-onboarding-1-1.sh", import.meta.url)
);
const fakeCurl = [
  "#!/usr/bin/env bash",
  '[[ "$1" == "-q" ]] || exit 96',
  'args=" $* "',
  '[[ "$args" == *" --cacert "* && "$args" == *" --proto =https "* ]] || exit 97',
  '[[ "$args" != *" --insecure "* && "$args" != *" -k "* ]] || exit 98',
  '[[ "$args" != *" Authorization:"* ]] || exit 99',
  'url="${@: -1}"',
  'case "$url" in',
  '  https://crm.test/api/v1/health) value=200 ;;',
  '  https://crm.test/api/v1/me/onboarding) value=401 ;;',
  '  https://crm.test/api/v1/me/onboarding/organization) value=401 ;;',
  '  https://crm.test/api/v1/me/onboarding/tour) value=401 ;;',
  '  *) exit 95 ;;',
  'esac',
  'if [[ "${MOCK_MODE:-}" == "transport" ]]; then printf "%s" "$value"; exit 56; fi',
  'if [[ "${MOCK_MODE:-}" == "noauth" && "$url" == */me/onboarding ]]; then value=200; fi',
  'if [[ "${MOCK_MODE:-}" == "missingroute" && "$url" == */me/onboarding/tour ]]; then value=404; fi',
  'if [[ "${MOCK_MODE:-}" == "unhealthy" && "$url" == */health ]]; then value=503; fi',
  'printf "%s" "$value"',
  "",
].join("\n");

function run(mode = "", options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "crm-11-smoke-"));
  try {
    const curl = join(dir, "curl");
    const ca = join(dir, "root-ca.pem");
    writeFileSync(curl, fakeCurl);
    chmodSync(curl, 0o700);
    if (!options.noCa) writeFileSync(ca, "MOCK ONLY");
    return spawnSync("bash", [script], {
      timeout: 3000,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: dir + delimiter + process.env.PATH,
        CRM_BASE_URL: options.url ?? "https://crm.test",
        CA_CERT: ca,
        MOCK_MODE: mode,
      },
    });
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

test("onboarding smoke probes health and auth guards", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /4 aprovacoes, 0 falha\(s\)/);
  assert.match(result.stdout, /GET \/me\/onboarding exige login: HTTP 401/);
  assert.match(
    result.stdout,
    /PUT \/me\/onboarding\/organization exige login: HTTP 401/
  );
  assert.match(
    result.stdout,
    /POST \/me\/onboarding\/tour exige login: HTTP 401/
  );
});

test("onboarding smoke rejects failed curl transfers", () => {
  const result = run("transport");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /HTTP 000/);
  assert.doesNotMatch(result.stdout, /\[OK\]/);
});

test("onboarding smoke rejects unexpectedly public and missing routes", () => {
  for (const mode of ["noauth", "missingroute", "unhealthy"]) {
    const result = run(mode);
    assert.equal(result.status, 1, mode);
    assert.match(result.stdout, /\[FALHA\]/, mode);
  }
});

test("onboarding smoke requires a CA file and a pure HTTPS origin", () => {
  assert.equal(run("", { noCa: true }).status, 2);
  for (const url of [
    "http://crm.test",
    "https://user:pass@crm.test",
    "https://crm.test/api/v1",
    "https://crm.test/?token=secret",
  ]) {
    const result = run("", { url });
    assert.equal(result.status, 2, url);
    assert.doesNotMatch(result.stdout, /\[OK\]/);
  }
});

test("onboarding smoke validates Bash syntax and TLS trust", () => {
  const syntax = spawnSync("bash", ["-n", script], {
    timeout: 3000,
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);
});
