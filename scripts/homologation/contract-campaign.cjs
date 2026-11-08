#!/usr/bin/env node
"use strict";

/**
 * Reproducible contract-property homologation, not HTTP requests.
 * Run after "pnpm --filter @axes/contracts build".
 *
 * Each case performs a real Zod parse and checks a domain invariant.
 * The manual CI matrix allocates disjoint case indexes to each shard.
 */
const {
  KnowledgeCreateInputSchema,
  KnowledgeUpdateInputSchema,
  KnowledgeListQuerySchema,
} = require("../../packages/contracts/dist/index.js");

function option(name, fallback) {
  const at = process.argv.indexOf("--" + name);
  if (at < 0) return fallback;
  const raw = process.argv[at + 1];
  if (!raw || !/^\d+$/.test(raw)) throw new Error("Invalid --" + name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error("Invalid --" + name);
  return value;
}

const total = option("total", 16_000);
const shard = option("shard", 0);
const shards = option("shards", 1);
const seedInput = option("seed", 20_261_107);
if (total < 1 || total > 100_000_000)
  throw new Error("Total cases must be between 1 and 100,000,000");
if (shards < 1 || shards > 64 || shard >= shards)
  throw new Error("Invalid shard layout");
if (seedInput > 0xffffffff) throw new Error("Seed must fit uint32");

const count = Math.floor(total / shards) + (shard < total % shards ? 1 : 0);
const offset =
  shard * Math.floor(total / shards) + Math.min(shard, total % shards);
let state = (seedInput ^ Math.imul(shard + 1, 0x9e3779b9)) >>> 0;
if (state === 0) state = 0x6d2b79f5;
let checksum = 2166136261;
const variants = new Array(16).fill(0);
const started = process.hrtime.bigint();

function next() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

for (let local = 0; local < count; local += 1) {
  const globalIndex = offset + local;
  const rand = next();
  const variant = globalIndex % 16;
  const hex = rand.toString(16).padStart(8, "0");
  const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-" + hex.padStart(12, "0");
  const title = "Registro " + hex + " " + globalIndex;
  const note = { type: "NOTE", title, noteContent: "Nota " + hex };
  const link = {
    type: "LINK",
    title,
    url: "https://example.test/homologation/" + hex,
  };
  const document = {
    type: "DOCUMENT",
    title,
    document: {
      fileName: "file-" + hex + ".txt",
      mimeType: "text/plain",
      base64: Buffer.from("doc-" + hex).toString("base64"),
    },
  };
  let schema = KnowledgeCreateInputSchema;
  let input;
  let accepted;
  switch (variant) {
    case 0:
      input = note;
      accepted = true;
      break;
    case 1:
      input = link;
      accepted = true;
      break;
    case 2:
      input = document;
      accepted = true;
      break;
    case 3:
      input = { ...note, title: "   " };
      accepted = false;
      break;
    case 4:
      input = { ...link, url: "javascript:alert(" + rand + ")" };
      accepted = false;
      break;
    case 5:
      input = {
        ...document,
        document: { ...document.document, fileName: "../" + hex },
      };
      accepted = false;
      break;
    case 6:
      input = {
        ...document,
        document: { ...document.document, base64: "@@" + hex },
      };
      accepted = false;
      break;
    case 7:
      input = { ...note, type: "UNKNOWN" };
      accepted = false;
      break;
    case 8:
      input = { ...note, companyIds: [uuid, uuid] };
      accepted = false;
      break;
    case 9:
      input = { ...note, companyIds: [uuid], accessLevel: "PRIVATE" };
      accepted = true;
      break;
    case 10:
      schema = KnowledgeListQuerySchema;
      input = {
        page: String((rand % 1000) + 1),
        limit: String((rand % 100) + 1),
        q: "  caso " + hex + "  ",
        type: "DOCUMENT",
      };
      accepted = true;
      break;
    case 11:
      schema = KnowledgeListQuerySchema;
      input = { page: "1", limit: String(101 + (rand % 100)) };
      accepted = false;
      break;
    case 12:
      schema = KnowledgeUpdateInputSchema;
      input = { title };
      accepted = true;
      break;
    case 13:
      schema = KnowledgeUpdateInputSchema;
      input = {};
      accepted = false;
      break;
    case 14:
      input = {
        ...document,
        document: { ...document.document, mimeType: "  " },
      };
      accepted = false;
      break;
    default:
      input = { ...link, title: "X".repeat(201 + (rand % 10)) };
      accepted = false;
  }

  const parsed = schema.safeParse(input);
  if (parsed.success !== accepted)
    throw new Error(
      "PROPERTY_FAILURE shard=" +
        shard +
        " index=" +
        globalIndex +
        " variant=" +
        variant +
        " seed=" +
        seedInput +
        " got=" +
        parsed.success +
        " expected=" +
        accepted
    );
  if (parsed.success) {
    if (variant === 10 && parsed.data.q !== input.q.trim())
      throw new Error("QUERY_NORMALIZATION_FAILURE index=" + globalIndex);
    if (variant === 9 && parsed.data.companyIds[0] !== uuid)
      throw new Error("RELATION_INTEGRITY_FAILURE index=" + globalIndex);
    if (variant === 2 && parsed.data.document.base64 !== input.document.base64)
      throw new Error("DOCUMENT_INTEGRITY_FAILURE index=" + globalIndex);
  }
  variants[variant] += 1;
  checksum = Math.imul(checksum ^ (rand + variant), 16777619) >>> 0;
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
const record = {
  suite: "knowledge-contract-properties",
  sha: process.env.GITHUB_SHA ?? null,
  seed: seedInput,
  shard,
  shards,
  totalRequested: total,
  offset,
  executed: count,
  passed: count,
  failed: 0,
  variants,
  checksum: checksum.toString(16).padStart(8, "0"),
  elapsedMs: Math.round(elapsedMs),
  casesPerSecond: Math.round((count * 1000) / Math.max(elapsedMs, 1)),
};
process.stdout.write(JSON.stringify(record) + "\n");
