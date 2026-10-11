import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/smoke-externo-c12.sh", import.meta.url)
);

function smoke(env) {
  return spawnSync("bash", [script], {
    encoding: "utf8",
    timeout: 3000,
    env: {
      ...process.env,
      CRM_BASE_URL: "https://127.0.0.1",
      CRM_HTTP_URL: "http://127.0.0.1",
      ...env,
    },
  });
}

test("release smoke refuses a missing CA before any network request", () => {
  const result = smoke({ CA_CERT: "" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /CA_CERT obrigatório/);
  assert.doesNotMatch(result.stdout, /Frontend HTTPS responde/);
});

test("release smoke refuses a nonexistent CA file", () => {
  const result = smoke({ CA_CERT: "/__missing_crm_ca__/root.pem" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /CA_CERT ausente ou ilegível/);
});

test("release smoke has no TLS verification bypass", () => {
  const code = readFileSync(script, "utf8");
  assert.doesNotMatch(code, /--insecure|(^|[[:space:]])-k([[:space:]]|$)/m);
  assert.match(code, /opts=\(--cacert "\$CA_CERT"\)/);
  assert.match(code, /expected_redirect/);
});
