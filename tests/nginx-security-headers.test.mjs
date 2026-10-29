import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(
  new URL("../deploy/nginx/crm-vendas.conf", import.meta.url),
  "utf8"
);

test("nginx enforces the reviewed HTTPS and security-header baseline", () => {
  assert.match(config, /ssl_protocols\s+TLSv1\.2\s+TLSv1\.3\s*;/);
  assert.match(config, /return\s+301\s+https:\/\/\$host\$request_uri\s*;/);
  assert.match(
    config,
    /add_header\s+Strict-Transport-Security\s+"max-age=31536000"\s+always\s*;/
  );
  assert.match(
    config,
    /add_header\s+X-Content-Type-Options\s+"nosniff"\s+always\s*;/
  );
  assert.match(
    config,
    /add_header\s+X-Frame-Options\s+"SAMEORIGIN"\s+always\s*;/
  );
  assert.match(
    config,
    /add_header\s+Referrer-Policy\s+"strict-origin-when-cross-origin"\s+always\s*;/
  );
  assert.match(
    config,
    /add_header\s+Permissions-Policy\s+"geolocation=\(\), payment=\(\), usb=\(\)"\s+always\s*;/
  );
  assert.doesNotMatch(config, /TLSv1(?:\s|;)/);
  assert.doesNotMatch(config, /TLSv1\.1(?:\s|;)/);
});

// This is an offline template contract, not a substitute for nginx -t or
// validation of the deployed server and its upstream response headers.
test("security headers are standalone, unique and inherited by every location", () => {
  const expected = new Map([
    ["Strict-Transport-Security", "max-age=31536000"],
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "SAMEORIGIN"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "geolocation=(), payment=(), usb=()"],
  ]);
  let depth = 0;
  let httpsServer = false;
  for (const line of config.split("\n")) {
    const directive = line.replace(/#.*/, "").trim();
    if (/^listen\s+443\s+ssl\s+http2;$/.test(directive)) {
      assert.equal(depth, 1);
      httpsServer = true;
    }
    if (/\badd_header\b/.test(directive)) {
      assert.equal(depth, 1, "location add_header overrides inherited headers");
      assert.ok(httpsServer, "headers must belong to the HTTPS server");
      const match = /^add_header ([\w-]+)\s+"([^"]+)" always;$/.exec(directive);
      assert.ok(match, "each header must be a standalone valid directive");
      assert.ok(
        expected.has(match[1]),
        "unexpected or duplicate security header"
      );
      assert.equal(match[2], expected.get(match[1]));
      expected.delete(match[1]);
    }
    // Braces in quoted strings do not change the Nginx block scope.
    const unquoted = directive.replace(/"[^"]*"|'[^']*'/g, "");
    depth += (unquoted.match(/\{/g) ?? []).length;
    depth -= (unquoted.match(/\}/g) ?? []).length;
    assert.ok(depth >= 0, "unbalanced blocks");
    if (depth === 0) httpsServer = false;
  }
  assert.equal(depth, 0, "unbalanced blocks");
  assert.equal(expected.size, 0, "all baseline headers must be active");
});
