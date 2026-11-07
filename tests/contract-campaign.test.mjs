import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const script = resolve("scripts/homologation/contract-campaign.cjs");

function run(args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1_000_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("property campaign checks all sixteen business-rule classes", () => {
  const report = run(["--total", "1600", "--seed", "20261107"]);
  assert.equal(report.executed, 1600);
  assert.equal(report.passed, 1600);
  assert.equal(report.failed, 0);
  assert.equal(report.variants.length, 16);
  assert.deepEqual(report.variants, Array(16).fill(100));
});

test("property campaign shards partition the requested total exactly", () => {
  const reports = [0, 1, 2].map(shard =>
    run([
      "--total",
      "10003",
      "--shards",
      "3",
      "--shard",
      String(shard),
    ])
  );
  assert.equal(
    reports.reduce((sum, item) => sum + item.executed, 0),
    10003
  );
  for (let index = 1; index < reports.length; index += 1) {
    assert.equal(
      reports[index].offset,
      reports[index - 1].offset + reports[index - 1].executed
    );
  }
  const replay = run([
    "--total",
    "10003",
    "--shards",
    "3",
    "--shard",
    "1",
  ]);
  assert.equal(replay.checksum, reports[1].checksum);
  assert.deepEqual(replay.variants, reports[1].variants);
});

test("property campaign rejects invalid and ambiguous configurations", () => {
  for (const args of [
    ["--total", "100000001"],
    ["--total", "0"],
    ["--shards", "0"],
    ["--shards", "3", "--shard", "3"],
    ["--total", "-1"],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
    });
    assert.notEqual(result.status, 0);
  }
});
