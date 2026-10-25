#!/usr/bin/env node
/**
 * Offline evidence index gate. Exit 0 only means files are present:
 * it does NOT verify their truth or approve deployment/release.
 */
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const required = [
  "serverDiagnostics",
  "httpsTrustedCa",
  "loginSession",
  "commercialFlow",
  "tenantIsolation",
  "backupRestore",
  "rollbackDrill",
  "securityReview",
  "operationalApproval",
];
const SHA = /^[0-9a-f]{40}$/;
const RUN =
  /^https:\/\/github[.]com\/jeffaxe81\/crm-vendas\/actions\/runs\/[1-9][0-9]*$/;
const MAX_SIZE = 2 * 1024 * 1024;

const isRecord = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function isWithin(root, file) {
  const rel = relative(root, file);
  return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}

async function checkFile(root, item, field, errors) {
  if (!isRecord(item) || item.status !== "passed") {
    errors.push(field + ": status deve ser passed");
    return;
  }
  if (
    typeof item.file !== "string" ||
    !item.file.trim() ||
    isAbsolute(item.file) ||
    item.file.includes("\\")
  ) {
    errors.push(field + ": caminho relativo inválido");
    return;
  }
  const target = resolve(root, item.file);
  if (!isWithin(root, target)) {
    errors.push(field + ": arquivo fora do diretório de evidências");
    return;
  }
  try {
    const stat = await lstat(target);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size < 1 ||
      stat.size > MAX_SIZE ||
      !isWithin(root, await realpath(target))
    ) {
      errors.push(field + ": evidência irregular ou excessiva");
    }
  } catch {
    errors.push(field + ": arquivo não encontrado");
  }
}

export async function evaluate(manifestPath, expectedSha) {
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    errors.push("Manifesto JSON ausente ou inválido");
  }
  if (!isRecord(manifest) || manifest.schemaVersion !== 1) {
    errors.push("schemaVersion deve ser 1");
  }
  const candidate = isRecord(manifest?.candidate) ? manifest.candidate : {};
  if (typeof candidate.sha !== "string" || !SHA.test(candidate.sha)) {
    errors.push("candidate.sha deve ser um SHA de 40 caracteres");
  }
  if (expectedSha && candidate.sha !== expectedSha) {
    errors.push("candidate.sha diverge do commit esperado");
  }
  if (
    candidate.ciHeadSha !== candidate.sha ||
    candidate.ciEvent !== "push" ||
    candidate.ciConclusion !== "success" ||
    typeof candidate.ciRunUrl !== "string" ||
    !RUN.test(candidate.ciRunUrl)
  ) {
    errors.push("CI declarado não corresponde a push/success do candidato");
  }
  const evidence = isRecord(manifest?.evidence) ? manifest.evidence : {};
  const root = dirname(resolve(manifestPath));
  const evidencePaths = new Map();
  for (const field of required) {
    const item = evidence[field];
    if (
      isRecord(item) &&
      typeof item.file === "string" &&
      !isAbsolute(item.file)
    ) {
      // One file per gate: never count the same report as nine checks.
      // Normalize "evidence/./report.txt" before looking for duplicates.
      const path = resolve(root, item.file);
      const first = evidencePaths.get(path);
      if (first) {
        errors.push(field + ": arquivo também utilizado por " + first);
      } else {
        evidencePaths.set(path, field);
      }
    }
    await checkFile(root, item, field, errors);
  }
  return {
    kind: "CRM_RC_EVIDENCE_INDEX_CHECK",
    status: errors.length ? "NO_GO" : "EVIDENCE_PRESENT_UNVERIFIED",
    productionApproved: false,
    humanVerificationRequired: true,
    externalChecksExecuted: false,
    sha: typeof candidate.sha === "string" ? candidate.sha : null,
    errors,
  };
}

const direct =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const manifestFlag = process.argv.indexOf("--manifest");
  const shaFlag = process.argv.indexOf("--sha");
  const manifest =
    manifestFlag >= 0 ? process.argv[manifestFlag + 1] : undefined;
  const expected = shaFlag >= 0 ? process.argv[shaFlag + 1] : undefined;
  if (
    manifestFlag < 0 ||
    !manifest ||
    shaFlag < 0 ||
    !expected ||
    !SHA.test(expected)
  ) {
    process.stderr.write(
      "--manifest <arquivo.json> e --sha <commit de 40 caracteres> são obrigatórios\n"
    );
    process.exitCode = 2;
  } else {
    const result = await evaluate(resolve(manifest), expected);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = result.errors.length ? 1 : 0;
  }
}
