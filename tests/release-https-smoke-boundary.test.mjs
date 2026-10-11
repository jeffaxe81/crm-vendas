import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const smokeScript = fileURLToPath(
  new URL("../scripts/smoke-externo-c12.sh", import.meta.url)
);

const mockCurl = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  'url=""',
  "head=0",
  "write_status=0",
  "cacert=0",
  'for arg in "$@"; do',
  '  case "$arg" in',
  '    http://*|https://*) url="$arg" ;;',
  "    --head) head=1 ;;",
  "    --write-out) write_status=1 ;;",
  "    --cacert) cacert=1 ;;",
  "  esac",
  "done",
  'if [[ "$url" == http://* ]]; then',
  "  if ((write_status)); then",
  '    printf "%s" "$MOCK_HTTP_STATUS"',
  "  else",
  '    printf "HTTP/1.1 %s Redirect\r\nLocation: %s\r\n\r\n" "$MOCK_HTTP_STATUS" "$MOCK_REDIRECT"',
  "  fi",
  "  exit 0",
  "fi",
  'if (( !cacert )) || [[ "$MOCK_TLS_FAILED" == 1 ]]; then',
  "  exit 60",
  "fi",
  "if ((write_status)); then",
  "  printf 200",
  "elif ((head)); then",
  '  printf "HTTP/1.1 200 OK\r\nStrict-Transport-Security: max-age=31536000\r\nX-Content-Type-Options: nosniff\r\n\r\n"',
  "else",
  "  exit 4",
  "fi",
  "",
].join("\n");

function executeSmoke(extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), "crm-smoke-mock-"));
  try {
    const curlFile = join(dir, "curl");
    const caFile = join(dir, "test-root-ca.pem");
    writeFileSync(curlFile, mockCurl);
    chmodSync(curlFile, 0o700);
    writeFileSync(caFile, "non-production-test-only");
    return spawnSync("bash", [smokeScript], {
      encoding: "utf8",
      timeout: 4000,
      env: {
        ...process.env,
        PATH: dir + delimiter + process.env.PATH,
        CRM_BASE_URL: "https://127.0.0.1",
        CRM_HTTP_URL: "http://127.0.0.1",
        CA_CERT: caFile,
        MOCK_HTTP_STATUS: "301",
        MOCK_TLS_FAILED: "0",
        MOCK_REDIRECT: "https://127.0.0.1/",
        ...extraEnv,
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("external smoke accepts matching HTTPS origin with explicit CA", () => {
  const result = executeSmoke();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /HTTP redireciona para o CRM HTTPS esperado/);
  assert.match(result.stdout, /Certificado TLS validado/);
  assert.doesNotMatch(result.stdout, /\[FALHA\]/);
});

test("external smoke blocks a foreign redirect hostname", () => {
  const result = executeSmoke({
    MOCK_REDIRECT: "https://127.0.0.1.attacker.invalid/",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /Redirecionamento inesperado/);
  assert.doesNotMatch(
    result.stdout,
    /HTTP redireciona para o CRM HTTPS esperado/
  );
});

test("external smoke blocks a different port or HTTP redirect", () => {
  for (const redirect of ["https://127.0.0.1:8443/", "http://127.0.0.1/"]) {
    const result = executeSmoke({ MOCK_REDIRECT: redirect });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /Redirecionamento inesperado/);
  }
});

test("external smoke rejects an untrusted TLS certificate", () => {
  const result = executeSmoke({ MOCK_TLS_FAILED: "1" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /Frontend HTTPS retornou/);
  assert.match(result.stdout, /Falha de confiança TLS/);
});

test("external smoke rejects plain HTTP 200 without a redirect", () => {
  const result = executeSmoke({ MOCK_HTTP_STATUS: "200" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /esperado 301 ou 308/);
});
