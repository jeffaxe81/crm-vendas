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


test("Linux setup-server path cannot bypass dry-run validation or pre-migration backup", () => {
  const deploy = readFileSync(
    new URL("../scripts/deploy.sh", import.meta.url),
    "utf8"
  );

  const checkOnly = deploy.indexOf('if [[ "$CHECK_ONLY" -eq 1 ]]');
  const postgresStart = deploy.indexOf('up -d --wait postgres');
  const backup = deploy.indexOf('pg_dump');
  const setupServer = deploy.indexOf('if [[ "$SETUP_SERVER" -eq 1 ]]');

  assert.ok(checkOnly >= 0, "check-only gate must exist");
  assert.ok(postgresStart >= 0, "PostgreSQL pre-update start must exist");
  assert.ok(backup >= 0, "pre-migration pg_dump must exist");
  assert.ok(setupServer >= 0, "setup-server delegation must exist");

  assert.ok(
    checkOnly < setupServer,
    "--check-only must exit before setup-server can mutate the host"
  );
  assert.ok(
    postgresStart < setupServer && backup < setupServer,
    "setup-server must only run after PostgreSQL is ready and backup is attempted"
  );
});
