#!/usr/bin/env node
/**
 * Release candidate code-only preflight.
 *
 * Fast, deterministic and non-destructive. It CANNOT certify the installed
 * server, external TLS trust, backups, authenticated workflows or approvals.
 * Run the operational gates in docs/deploy/deploy-https.md separately.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
async function load(path) {
  try {
    return await readFile(resolve(root, path), "utf8");
  } catch {
    errors.push("Arquivo obrigatório ausente: " + path);
    return "";
  }
}
function requireEvidence(condition, description) {
  if (!condition) errors.push(description);
}

const [
  emailModule,
  compose,
  deployCheck,
  externalSmoke,
  ciWorkflow,
  deployGuide,
] = await Promise.all([
  load("apps/api/src/messaging/email/email.module.ts"),
  load("compose.yaml"),
  load("scripts/verificar-deploy.sh"),
  load("scripts/smoke-externo-c12.sh"),
  load(".github/workflows/ci.yml"),
  load("docs/deploy/deploy-https.md"),
]);

// Safe release baseline: email remains explicitly disabled until the
// independent provider and operational security gates are complete.
requireEvidence(
  /\{\s*provide:\s*EMAIL_PROVIDER,\s*useClass:\s*DisabledEmailProvider\s*\}/.test(
    emailModule
  ),
  "EmailProvider nao esta explicitamente desabilitado"
);
requireEvidence(
  /WEBHOOK_WORKER_ENABLED:\s*\$\{WEBHOOK_WORKER_ENABLED:-false\}/.test(compose),
  "Webhooks nao estao desabilitados por padrao"
);
requireEvidence(
  (compose.match(/\$\{BIND_ADDRESS:-127\.0\.0\.1\}:(?:3000|3001|5432):/g) ?? [])
    .length === 3,
  "Portas de front, API e banco devem ficar ligadas a 127.0.0.1 por padrao"
);
requireEvidence(
  /db-bootstrap:\s*\n\s*condition:\s*service_completed_successfully/.test(
    compose
  ),
  "API nao aguarda bootstrap seguro do banco"
);
requireEvidence(
  /migrate:\s*\n\s*condition:\s*service_completed_successfully/.test(compose),
  "API nao aguarda migrations concluidas"
);
requireEvidence(
  deployCheck.includes("nginx -t") &&
    deployCheck.includes("APP_DB_PASSWORD") &&
    deployCheck.includes("CRM_CA"),
  "Diagnostico de deploy sem verificacao essencial"
);
requireEvidence(
  externalSmoke.includes("CRM_BASE_URL") &&
    externalSmoke.includes('opts=(--cacert "$CA_CERT")') &&
    !externalSmoke.includes("--insecure") &&
    externalSmoke.includes("/api/v1/health"),
  "Smoke test externo nao cobre TLS e health"
);
requireEvidence(
  ciWorkflow.includes("Run end-to-end test") &&
    ciWorkflow.includes("Build application images") &&
    ciWorkflow.includes("Deploy database migrations"),
  "Pipeline principal sem etapas exigidas para release"
);
requireEvidence(
  deployGuide.includes("Rollback") &&
    deployGuide.includes("Critérios de aceite"),
  "Guia de deploy sem rollback ou aceite"
);

const result = {
  kind: "CRM_CODE_PREFLIGHT",
  status: errors.length ? "BLOCKED" : "CODE_CHECKS_PASSED",
  productionApproved: false,
  operationalChecksPending: [
    "Deploy server and restricted PostgreSQL role",
    "TLS certificate chain and hostname/IP",
    "Login and CRM business workflows in installed environment",
    "External HTTPS smoke test",
    "Backup restore and rollback evidence",
    "Independent security and operational approval",
  ],
  errors,
};
if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  process.stdout.write(
    "CRM RC code preflight: " +
      result.status +
      "\n" +
      "ATENCAO: nao valida deploy nem autoriza producao.\n"
  );
  for (const error of errors) process.stderr.write("- " + error + "\n");
}
process.exitCode = errors.length ? 1 : 0;
