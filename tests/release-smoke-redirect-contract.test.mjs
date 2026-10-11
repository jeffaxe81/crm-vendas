import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/smoke-externo-c12.sh", import.meta.url)
);

// A deterministic fake curl exercises the actual bash control flow,
// not merely source-string checks. It never reaches the network.
const fakeCurl = String.raw`#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--insecure") || args.includes("-k")) process.exit(79);
const url = args.at(-1) ?? "";
const code = args.includes("--write-out");
if (url.startsWith("https://")) {
  const i = args.indexOf("--cacert");
  if (i === -1 || args[i + 1] !== process.env.CA_CERT) process.exit(78);
  if (code) process.stdout.write(process.env.FAKE_HTTPS_STATUS || "200");
  else process.stdout.write(
    "HTTP/2 200\\r\\nstrict-transport-security: max-age=31536000\\r\\n" +
    "x-content-type-options: nosniff\\r\\n\\r\\n"
  );
} else if (url.startsWith("http://")) {
  if (code) process.stdout.write("301");
  else process.stdout.write(
    "HTTP/1.1 301 Moved Permanently\\r\\nLocation: " +
    (process.env.FAKE_REDIRECT || "https://crm.example.test/") + "\\r\\n\\r\\n"
  );
} else process.exit(77);
`;

function executeSmoke(t, env = {}) {
  const folder = mkdtempSync(join(tmpdir(), "crm-smoke-contract-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const bin = join(folder, "bin");
  mkdirSync(bin);
  const curl = join(bin, "curl");
  writeFileSync(curl, fakeCurl, { mode: 0o755 });
  const ca = join(folder, "test-ca.pem");
  writeFileSync(ca, "FAKE CERTIFICATE ONLY; NO NETWORK IS USED\n");
  return spawnSync("bash", [script], {
    encoding: "utf8",
    timeout: 5000,
    env: {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      CRM_BASE_URL: "https://crm.example.test",
      CRM_HTTP_URL: "http://crm.example.test",
      CA_CERT: ca,
      ...env,
    },
  });
}

test("smoke requires correct origin, trusted-CA curl arguments and healthy endpoints", t => {
  const result = executeSmoke(t);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr + "\n" + result.stdout);
  assert.match(result.stdout, /HTTP redireciona para o CRM HTTPS esperado/);
  assert.match(result.stdout, /Certificado TLS validado com a CA informada/);
  assert.match(result.stdout, /0 falha\(s\)/);
});

test("smoke rejects redirect to a different HTTPS hostname", t => {
  const result = executeSmoke(t, { FAKE_REDIRECT: "https://attacker.example.test/" });
  assert.equal(result.status, 1, result.stderr + "\n" + result.stdout);
  assert.match(result.stdout, /Redirecionamento inesperado/);
  assert.match(result.stdout, /1 falha\(s\)/);
});

test("smoke rejects HTTPS health failure even with correct redirect and CA", t => {
  const result = executeSmoke(t, { FAKE_HTTPS_STATUS: "503" });
  assert.equal(result.status, 1, result.stderr + "\n" + result.stdout);
  assert.match(result.stdout, /Frontend HTTPS retornou 503/);
  assert.match(result.stdout, /API .* retornou 503/);
});

test("smoke rejects an invalid HTTP base before network checks", t => {
  const result = executeSmoke(t, { CRM_HTTP_URL: "https://crm.example.test" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /CRM_HTTP_URL deve começar com http/);
  assert.doesNotMatch(result.stdout, /Smoke test externo/);
});
