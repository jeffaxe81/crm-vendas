#!/usr/bin/env node
"use strict";
const { readdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const folder = process.argv[2] ?? "campaign-results";
const total = Number(process.argv[3] ?? 100_000_000);
const shards = Number(process.argv[4] ?? 16);
if (!Number.isSafeInteger(total) || total < 1) throw Error("Invalid total");
if (!Number.isSafeInteger(shards) || shards < 1 || shards > 64)
  throw Error("Invalid shards");
const files = readdirSync(folder).filter(file =>
  /^campaign-\d+\.json$/.test(file)
);
if (files.length !== shards) throw Error("Missing campaign shard results");
const rows = files.map(file =>
  JSON.parse(readFileSync(join(folder, file), "utf8"))
);
rows.sort((a, b) => a.shard - b.shard);
let start = 0;
const totals = new Array(16).fill(0);
for (let i = 0; i < shards; i++) {
  const row = rows[i];
  if (
    row.shard !== i ||
    row.shards !== shards ||
    row.totalRequested !== total ||
    row.offset !== start ||
    row.executed !== row.passed ||
    row.failed !== 0 ||
    !Array.isArray(row.variants) ||
    row.variants.length !== 16 ||
    row.variants.reduce((a, b) => a + b, 0) !== row.executed ||
    (process.env.GITHUB_SHA && row.sha !== process.env.GITHUB_SHA)
  )
    throw Error("Invalid evidence for shard " + i);
  start += row.executed;
  for (let j = 0; j < 16; j++) totals[j] += row.variants[j];
}
if (start !== total || totals.reduce((a, b) => a + b, 0) !== total)
  throw Error("Incomplete campaign coverage");
const summary = {
  suite: "knowledge-contract-properties",
  sha: process.env.GITHUB_SHA ?? null,
  totalRequested: total,
  passed: total,
  failed: 0,
  shards,
  perVariant: totals,
  results: rows,
};
writeFileSync("campaign-summary.json", JSON.stringify(summary, null, 2) + "\n");
const line = `C5 property campaign: ${total.toLocaleString("en-US")} passed, ${shards} shards, 0 failures, sha=${summary.sha ?? "local"}`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = require("node:fs");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    "## CRM — deterministic contract homologation\n\n" +
      "- Commit: `" +
      (summary.sha ?? "local") +
      "`\n" +
      "- Executed: **" +
      total.toLocaleString("en-US") +
      "** contract cases in " +
      shards +
      " shards\n" +
      "- Failed: **0**\n" +
      "- Coverage: 16 property classes (NOTE, LINK, DOCUMENT, input, URL, UUID, pagination, update)\n" +
      "- This is **contract property testing**, not 100 million HTTP requests or browser journeys.\n"
  );
}
