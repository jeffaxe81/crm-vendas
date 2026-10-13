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
  'if [[ "${1:-}" != "-q" ]]; then exit 99; fi',
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
  '    if [[ "${MOCK_HTTP_FAIL_AFTER_STATUS:-0}" == 1 ]]; then exit 18; fi',
  "  else",
  '    printf "HTTP/1.1 %s Redirect\r\nLocation: %s\r\n" "${MOCK_SECOND_HTTP_STATUS:-$MOCK_HTTP_STATUS}" "$MOCK_REDIRECT"',
  '    if [[ -n "${MOCK_EXTRA_REDIRECT:-}" ]]; then',
  '      printf "Location: %s\r\n" "$MOCK_EXTRA_REDIRECT"',
  "    fi",
  '    printf "\r\n"',
  "  fi",
  "  exit 0",
  "fi",
  'if (( !cacert )) || [[ "$MOCK_TLS_FAILED" == 1 ]]; then',
  "  exit 60",
  "fi",
  "if ((write_status)); then",
  "  printf 200",
  '  if [[ "${MOCK_HTTPS_FAIL_AFTER_STATUS:-0}" == 1 ]]; then exit 18; fi',
  "elif ((head)); then",
  '  printf "HTTP/1.1 200 OK\r\nStrict-Transport-Security: max-age=31536000\r\nX-Content-Type-Options: nosniff\r\n\r\n"',
  '  if [[ "${MOCK_HTTPS_HEAD_FAIL_AFTER_HEADERS:-0}" == 1 ]]; then exit 18; fi',
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

test("external smoke rejects HTTP 200 printed before a curl transport failure", () => {
  const result = executeSmoke({ MOCK_HTTPS_FAIL_AFTER_STATUS: "1" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /Frontend HTTPS retornou 000/);
  assert.match(result.stdout, /API \/api\/v1\/health retornou 000/);
  assert.match(result.stdout, /Falha de confiança TLS/);
});

test("external smoke rejects partial security headers after a curl failure", () => {
  const result = executeSmoke({ MOCK_HTTPS_HEAD_FAIL_AFTER_HEADERS: "1" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /HSTS ausente/);
  assert.match(result.stdout, /X-Content-Type-Options ausente/);
});

test("external smoke rejects duplicate redirect Location headers", () => {
  const result = executeSmoke({
    MOCK_EXTRA_REDIRECT: "https://attacker.invalid/",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /Redirecionamento inesperado ou ambíguo/);
});

test("external smoke rejects redirect HTTP status if curl later fails", () => {
  const result = executeSmoke({ MOCK_HTTP_FAIL_AFTER_STATUS: "1" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /HTTP retornou 000/);
});

test("external smoke rejects a changed HTTP status with a matching Location", () => {
  const result = executeSmoke({ MOCK_SECOND_HTTP_STATUS: "200" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stdout, /Redirecionamento inesperado ou ambíguo/);
  assert.doesNotMatch(
    result.stdout,
    /HTTP redireciona para o CRM HTTPS esperado/
  );
});

test("external smoke rejects a different HTTP and HTTPS target host", () => {
  const result = executeSmoke({ CRM_HTTP_URL: "http://unrelated.test" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.match(result.stderr, /mesmo host/);
  assert.doesNotMatch(result.stdout, /Frontend HTTPS responde 200/);
});

test("external smoke rejects URLs with credentials, paths, queries and fragments", () => {
  const invalid = [
    { CRM_BASE_URL: "https://user:password@127.0.0.1" },
    { CRM_BASE_URL: "https://127.0.0.1/custom-page" },
    { CRM_BASE_URL: "https://127.0.0.1?test=1" },
    { CRM_BASE_URL: "https://127.0.0.1/#fragment" },
    { CRM_HTTP_URL: "http://127.0.0.1/redirect" },
    { CRM_HTTP_URL: "http://127.0.0.1?fake=1" },
    { CRM_HTTP_URL: "http://127.0.0.1@other.example" },
  ];
  for (const env of invalid) {
    const result = executeSmoke(env);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2, JSON.stringify(env) + result.stderr);
    assert.match(result.stderr, /deve ser apenas uma origem/);
    assert.doesNotMatch(result.stdout, /Frontend HTTPS responde 200/);
  }
});

test("external smoke supports separate HTTP and HTTPS ports on the same host", () => {
  const result = executeSmoke({
    CRM_BASE_URL: "https://127.0.0.1:8443",
    CRM_HTTP_URL: "http://127.0.0.1:8080",
    MOCK_REDIRECT: "https://127.0.0.1:8443/",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Certificado TLS validado/);
});
