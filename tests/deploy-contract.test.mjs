import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("deployment contract supports a real Linux host", () => {
  const deploy = read("scripts/deploy.sh");
  const compose = read("compose.yaml");
  const envExample = read(".env.example");
  const apiDockerfile = read("apps/api/Dockerfile");
  const webDockerfile = read("apps/web/Dockerfile");

  assert.match(deploy, /^#!\/usr\/bin\/env bash/m);
  assert.match(deploy, /set -Eeuo pipefail/);
  assert.match(deploy, /docker compose/);
  assert.match(deploy, /prisma migrate deploy/);
  assert.match(deploy, /dist\/scripts\/bootstrap-admin\.js/);
  assert.match(deploy, /pg_dump/);
  assert.match(deploy, /--wait/);
  assert.match(deploy, /api\/v1\/health/);

  assert.match(compose, /POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD/);
  assert.match(compose, /NEXT_PUBLIC_API_BASE_URL:\s*\$\{NEXT_PUBLIC_API_BASE_URL/);
  assert.match(compose, /args:[\s\S]*NEXT_PUBLIC_API_BASE_URL/);

  assert.match(envExample, /^POSTGRES_DB=/m);
  assert.match(envExample, /^POSTGRES_USER=/m);
  assert.match(envExample, /^POSTGRES_PASSWORD=/m);

  assert.match(apiDockerfile, /COPY --from=build[^\n]*\/app\/apps\/api\/prisma/);
  assert.match(apiDockerfile, /COPY --from=build[^\n]*\/app\/apps\/api\/prisma\.config\.ts/);

  assert.match(webDockerfile, /ARG NEXT_PUBLIC_API_BASE_URL/);
  assert.match(webDockerfile, /ENV NEXT_PUBLIC_API_BASE_URL=/);
});
