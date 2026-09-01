import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('compose defines the Cycle 0 service topology', () => {
  const output = execFileSync(
    'docker',
    ['compose', 'config', '--format', 'json'],
    {
      encoding: 'utf8',
    },
  );
  const compose = JSON.parse(output);

  assert.ok(compose.services.postgres);
  assert.ok(compose.services.api);
  assert.ok(compose.services.web);

  assert.equal(
    compose.services.api.depends_on.postgres.condition,
    'service_healthy',
  );
  assert.equal(
    compose.services.web.depends_on.api.condition,
    'service_healthy',
  );
});
