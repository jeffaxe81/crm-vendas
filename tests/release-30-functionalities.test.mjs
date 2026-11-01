import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestPath = new URL(
  "../docs/releases/release-30-functionalidades-2026-11-01.json",
  import.meta.url,
);

test("release manifest freezes exactly 30 integral functionalities", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const items = manifest.functionalities;

  assert.equal(manifest.status, "release-candidate");
  assert.equal(items.length, 30);

  const ids = items.map((item) => item.id);
  const names = items.map((item) => item.name);

  assert.equal(new Set(ids).size, 30);
  assert.equal(new Set(names).size, 30);
  assert.ok(items.every((item) => item.status === "integral"));
  assert.deepEqual(
    ids,
    Array.from(
      { length: 30 },
      (_, i) => `F${String(i + 1).padStart(2, "0")}`,
    ),
  );
});
