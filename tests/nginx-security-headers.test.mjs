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
