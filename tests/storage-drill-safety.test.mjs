import assert from "node:assert/strict";
import test from "node:test";
import { storageDrillConnections } from "../apps/api/src/data-management/storage-drill-safety.ts";

const local = {
  NODE_ENV: "test",
  MIGRATION_DATABASE_URL: "postgresql://owner:secret@127.0.0.1:5432/drill",
  RLS_DATABASE_URL: "postgresql://restricted:secret@127.0.0.1:5432/drill",
};
test("drill accepts matching local test connections", () => {
  assert.deepEqual(storageDrillConnections(local), {
    owner: local.MIGRATION_DATABASE_URL,
    restricted: local.RLS_DATABASE_URL,
  });
});
test("drill rejects production mode, missing URLs, remote targets and mismatches", () => {
  for (const override of [
    { NODE_ENV: "production" },
    {
      RLS_DATABASE_URL:
        "postgresql://restricted@127.0.0.1:5432/drill?host=production.example",
    },
    { RLS_DATABASE_URL: undefined },
    { MIGRATION_DATABASE_URL: "postgresql://owner@production.example/drill" },
    { RLS_DATABASE_URL: "postgresql://restricted@127.0.0.1:5432/other" },
    { RLS_DATABASE_URL: "postgresql://restricted@127.0.0.1:5433/drill" },
    { RLS_DATABASE_URL: "postgresql://restricted@127.0.0.1:5432/" },
  ])
    assert.throws(() => storageDrillConnections({ ...local, ...override }));
});
