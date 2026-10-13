import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Linux deployment script preserves data before updating the stack", () => {
  const deploy = readFileSync(
    new URL("../scripts/deploy.sh", import.meta.url),
    "utf8"
  );

  assert.match(deploy, /^#!\/usr\/bin\/env bash/m);
  assert.match(deploy, /set -Eeuo pipefail/);
  assert.match(deploy, /docker compose/);
  assert.match(deploy, /config --quiet/);
  assert.match(deploy, /up -d --wait postgres/);
  assert.match(deploy, /pg_dump/);
  assert.match(deploy, /up -d --build --remove-orphans --wait/);
  assert.match(deploy, /dist\/scripts\/bootstrap-admin\.js/);
  assert.match(deploy, /api\/v1\/health/);
  assert.match(deploy, /deploy\/setup-servidor\.sh/);
});
