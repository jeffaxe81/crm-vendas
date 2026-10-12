import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const serverScript = fileURLToPath(
  new URL("../scripts/verificar-deploy.sh", import.meta.url)
);
const externalScript = fileURLToPath(
  new URL("../scripts/smoke-externo-c12.sh", import.meta.url)
);

test("release HTTPS diagnostics have valid Bash syntax without hitting the server", () => {
  for (const script of [serverScript, externalScript]) {
    const result = spawnSync("bash", ["-n", script], {
      encoding: "utf8",
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("server diagnostics require an accessible CA and never skip HTTPS trust", () => {
  const code = readFileSync(serverScript, "utf8");
  assert.doesNotMatch(code, /curl\s+(?:-[a-z]*k\b|--insecure)/i);
  assert.match(code, /trusted_code\(\)/);
  assert.match(code, /--cacert "\$CA"/);
  assert.match(code, /--resolve "\$IP:443:127\.0\.0\.1"/);
  assert.match(code, /-f "\$CA" && -r "\$CA"/);
  assert.match(code, /FA "CA obrigatória ausente ou ilegível:/);
  assert.match(code, /TLS autenticado/);
  assert.match(code, /HSTS ausente ou TLS não autenticado/);
});

test("external smoke and server diagnostics reject insecure TLS bypass", () => {
  const external = readFileSync(externalScript, "utf8");
  const server = readFileSync(serverScript, "utf8");
  assert.doesNotMatch(external, /--insecure|curl\s+-[a-z]*k\b/i);
  assert.doesNotMatch(server, /--insecure|curl\s+-[a-z]*k\b/i);
  assert.match(external, /CA_CERT obrigatório/);
});

test("release diagnostics fail closed on curl transfer errors and ambiguous redirects", () => {
  const server = readFileSync(serverScript, "utf8");
  const external = readFileSync(externalScript, "utf8");
  assert.equal(
    (server.match(/if status=\$\(curl /g) ?? []).length,
    2,
    "both local and TLS server probes must inspect curl exit status"
  );
  assert.match(external, /if status=\$\(curl /);
  assert.match(server, /printf '000'/);
  assert.match(external, /printf '000'/);
  assert.match(server, /hsts_headers=\$\(curl /);
  assert.match(external, /location_count=\$\(awk /);
});

test("release HTTPS probes ignore ambient curlrc configuration", () => {
  const server = readFileSync(serverScript, "utf8");
  const external = readFileSync(externalScript, "utf8");
  for (const [name, source] of [
    ["server", server],
    ["external", external],
  ]) {
    assert.equal(
      (source.match(/curl -q --silent/g) ?? []).length,
      3,
      name + " must pass -q first on all three HTTP/TLS probes"
    );
    assert.doesNotMatch(
      source,
      /curl --silent/,
      name + " must not inherit .curlrc on any probe"
    );
  }
});
