#!/usr/bin/env node
/**
 * Laboratório externo Axesistemas. Nunca usa conexão SQL nem limpa registros.
 * node qa-external/run.mjs: leitura por padrão; QA_MODE=write requer 3 travas.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeApiUrl, normalizeWebUrl, assertWriteGuard, apiCall, expectHttp } from "./guards.mjs";

const scenarios = [];
const start = Date.now();
const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
const mode = process.env.QA_MODE ?? "read";
const source = "qa-external";
let apiUrl;
let webUrl;

function requireValue(value, field) {
  if (!value || typeof value !== "string") throw new Error(field + " ausente na resposta.");
  return value;
}

async function check(id, title, action) {
  const since = Date.now();
  try {
    const value = await action();
    scenarios.push({ id, title, status: "PASS", durationMs: Date.now() - since });
    console.log("PASS " + id + " " + title);
    return value;
  } catch (error) {
    scenarios.push({
      id, title, status: "FAIL", durationMs: Date.now() - since,
      reason: error instanceof Error ? error.message.slice(0, 220) : "Falha não identificada"
    });
    console.error("FAIL " + id + " " + title);
    return null;
  }
}

function blocked(id, title, dependency) {
  scenarios.push({ id, title, status: "BLOCKED", reason: "Pré-requisito não aprovado: " + dependency });
  console.log("BLOCKED " + id + " " + title);
}

async function call(path, options, expected, label) {
  return expectHttp(await apiCall(apiUrl, path, options), expected, label);
}
async function writeJourneys() {
  const token = randomUUID().replace(/-/g, "").slice(0, 14);
  const passwordA = "QA-Axe-2026!" + randomUUID();
  const passwordB = "QA-Axe-2026!" + randomUUID();
  const emailA = "qa-" + token + "-a@example.test";
  const emailB = "qa-" + token + "-b@example.test";
  const a = await check("TEN-01", "Cadastro do tenant sintético A", async () => {
    const data = await call("/auth/register", {
      method: "POST", body: {
        organizationName: "QA-Axe-" + token + "-A",
        adminDisplayName: "Administrador de homologação A",
        adminEmail: emailA, adminPassword: passwordA
      }
    }, 201, "Registro tenant A");
    requireValue(data?.accessToken, "accessToken A");
    requireValue(data?.organization?.id, "organization.id A");
    return data;
  });
  const b = await check("TEN-02", "Cadastro do tenant sintético B", async () => {
    const data = await call("/auth/register", {
      method: "POST", body: {
        organizationName: "QA-Axe-" + token + "-B",
        adminDisplayName: "Administrador de homologação B",
        adminEmail: emailB, adminPassword: passwordB
      }
    }, 201, "Registro tenant B");
    requireValue(data?.accessToken, "accessToken B");
    requireValue(data?.organization?.id, "organization.id B");
    return data;
  });
  if (!a || !b) {
    blocked("FLOW-00", "Jornada comercial e isolamento", "TEN-01 e TEN-02");
    return;
  }
  const ta = a.accessToken, tb = b.accessToken;
  await check("AUT-01", "Senha errada não autentica", async () => {
    await call("/auth/login", { method: "POST", body: {
      email: emailA, password: "SenhaIncorreta2026", organizationSlug: a.organization.slug
    } }, 401, "Senha inválida");
  });
  await check("AUT-02", "Login do tenant A", async () => {
    const data = await call("/auth/login", { method: "POST", body: {
      email: emailA, password: passwordA, organizationSlug: a.organization.slug
    } }, 200, "Login A");
    if (data?.organization?.id !== a.organization.id) throw new Error("Sessão retornou outro tenant.");
  });
  await check("SEC-01", "POST anônimo bloqueado", async () => {
    await call("/companies", { method: "POST", body: { legalName: "QA anonimo" } }, 401, "POST anônimo");
  });

  const companyA = await check("CAD-01", "Empresa A, persistência em leitura", async () => {
    const data = await call("/companies", { method: "POST", token: ta, body: {
      legalName: "QA-Empresa-" + token + "-A", tradeName: "Empresa de testes A"
    } }, 201, "Criar empresa A");
    requireValue(data?.id, "ID da empresa A");
    const read = await call("/companies/" + data.id, { token: ta }, 200, "Ler empresa A");
    if (read?.id !== data.id) throw new Error("Persistência incorreta.");
    return data;
  });
  const companyB = await check("CAD-02", "Empresa B independente", async () => {
    const data = await call("/companies", { method: "POST", token: tb, body: {
      legalName: "QA-Empresa-" + token + "-B"
    } }, 201, "Criar empresa B");
    requireValue(data?.id, "ID da empresa B");
    return data;
  });
  await check("CAD-03", "Validação de razão social vazia", async () => {
    await call("/companies", { method: "POST", token: ta, body: { legalName: "" } }, 400, "Razão social vazia");
  });
  if (companyA && companyB) {
    await check("TEN-03", "Isolamento cruzado de empresas em leitura", async () => {
      await call("/companies/" + companyA.id, { token: tb }, 404, "B não deve ler A");
      await call("/companies/" + companyB.id, { token: ta }, 404, "A não deve ler B");
    });
  } else blocked("TEN-03", "Isolamento cruzado de empresas", "CAD-01/CAD-02");

  const contactA = await check("CON-01", "Criar contato A", async () => {
    const data = await call("/contacts", { method: "POST", token: ta,
      body: { fullName: "QA Contato " + token + " A", jobTitle: "Comprador" }
    }, 201, "Criar contato A");
    requireValue(data?.id, "ID contato A");
    return data;
  });
  const contactB = await check("CON-02", "Criar contato B", async () => {
    const data = await call("/contacts", { method: "POST", token: tb,
      body: { fullName: "QA Contato " + token + " B" }
    }, 201, "Criar contato B");
    requireValue(data?.id, "ID contato B");
    return data;
  });
  if (contactA && contactB) {
    await check("TEN-04", "Isolamento cruzado de contatos", async () => {
      await call("/contacts/" + contactB.id, { token: ta }, 404, "A não deve ler contato B");
      await call("/contacts/" + contactA.id, { token: tb }, 404, "B não deve ler contato A");
    });
  } else blocked("TEN-04", "Isolamento de contatos", "CON-01/CON-02");
  if (contactA) {
    await check("CON-03", "Canal de e-mail no contato", async () => {
      const data = await call("/contacts/" + contactA.id + "/channels", {
        method: "POST", token: ta,
        body: { type: "EMAIL", value: "qa-" + token + "@example.test", isPrimary: true }
      }, 201, "Criar canal do contato");
      requireValue(data?.id, "ID do canal");
    });
  } else blocked("CON-03", "Canal de e-mail", "CON-01");

  const pipeline = await check("COM-01", "Criar/ler funil comercial padrão", async () => {
    const data = await call("/pipelines/default", { method: "POST", token: ta }, 200, "Funil padrão");
    if (!Array.isArray(data?.stages) || data.stages.length < 2) throw new Error("Funil sem etapas suficientes.");
    return data;
  });
  let opportunity;
  if (pipeline && companyA) {
    opportunity = await check("COM-02", "Oportunidade vinculada ao cliente", async () => {
      const data = await call("/opportunities", { method: "POST", token: ta, body: {
        pipelineId: pipeline.id, stageId: pipeline.stages[0].id,
        companyId: companyA.id, ownerUserId: a.user.id,
        title: "QA Oportunidade " + token, estimatedValue: "2500.00"
      } }, 201, "Criar oportunidade");
      requireValue(data?.id, "ID da oportunidade");
      return data;
    });
  } else blocked("COM-02", "Oportunidade vinculada ao cliente", "COM-01/CAD-01");

  if (opportunity) {
    await check("COM-03", "Movimentação de etapa com versionamento", async () => {
      const result = await call("/opportunities/" + opportunity.id + "/stage", {
        method: "PATCH", token: ta,
        body: { stageId: pipeline.stages[1].id, version: opportunity.version }
      }, 200, "Mover etapa");
      if (result?.stageId !== pipeline.stages[1].id) throw new Error("Etapa não persistiu.");
    });
    await check("TEN-05", "Isolamento cruzado de oportunidades", async () => {
      await call("/opportunities/" + opportunity.id, { token: tb }, 404, "B não deve ler oportunidade A");
    });
  } else {
    blocked("COM-03", "Movimentação de etapa", "COM-02");
    blocked("TEN-05", "Isolamento de oportunidades", "COM-02");
  }

  const activity = await check("ATV-01", "Criar atividade do vendedor", async () => {
    const data = await call("/activities", { method: "POST", token: ta, body: {
      type: "TASK", title: "QA follow-up " + token,
      ownerUserId: a.user.id, priority: "HIGH",
      ...(companyA ? { companyId: companyA.id } : {})
    } }, 201, "Criar tarefa");
    requireValue(data?.id, "ID da tarefa");
    return data;
  });
  if (activity) {
    await check("ATV-02", "Concluir atividade e persistir status", async () => {
      await call("/activities/" + activity.id, { method: "PATCH", token: ta,
        body: { status: "COMPLETED" } }, 200, "Concluir tarefa");
      const saved = await call("/activities/" + activity.id, { token: ta }, 200, "Ler tarefa");
      if (saved?.status !== "COMPLETED") throw new Error("Status da tarefa não persistiu.");
    });
  } else blocked("ATV-02", "Concluir atividade", "ATV-01");

  const ticket = await check("SUP-01", "Abrir chamado e gerar protocolo", async () => {
    const data = await call("/tickets", { method: "POST", token: ta, body: {
      subject: "QA chamado " + token, channel: "WEB", priority: "HIGH",
      ...(companyA ? { companyId: companyA.id } : {})
    } }, 201, "Criar chamado");
    requireValue(data?.id, "ID chamado");
    requireValue(data?.protocol, "protocolo");
    return data;
  });
  if (ticket) {
    await check("SUP-02", "Avançar chamado para em atendimento", async () => {
      const result = await call("/tickets/" + ticket.id + "/status", {
        method: "POST", token: ta,
        body: { status: "IN_PROGRESS", version: ticket.version }
      }, 201, "Alterar status do chamado");
      if (result?.status !== "IN_PROGRESS") throw new Error("Status de chamado incorreto.");
    });
    await check("TEN-06", "Isolamento cruzado de chamados", async () => {
      await call("/tickets/" + ticket.id, { token: tb }, 404, "B não deve ler chamado A");
    });
  } else {
    blocked("SUP-02", "Avançar chamado", "SUP-01");
    blocked("TEN-06", "Isolamento de chamados", "SUP-01");
  }
  await check("REL-01", "Relatório gerencial autenticado", async () => {
    const report = await call("/reports/management-summary", { token: ta }, 200, "Resumo gerencial");
    if (!report || typeof report !== "object") throw new Error("Relatório inválido.");
  });
}
async function report() {
  const dir = resolve(process.env.QA_OUTPUT_DIR || "qa-external/artifacts");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  for (const item of scenarios) counts[item.status]++;
  const body = { suite: source, runId, mode, targetOrigin: new URL(apiUrl).origin,
    startedAt: new Date(start).toISOString(), finishedAt: new Date().toISOString(),
    durationMs: Date.now() - start, counts, productionApproved: false,
    operationalHomologation: "PENDING_MANUAL", scenarios };
  const name = "qa-" + runId;
  await writeFile(resolve(dir, name + ".json"), JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
  const lines = [
    "# Relatório Axesistemas QA — " + runId,
    "", "**Alvo:** " + body.targetOrigin, "**Modo:** " + mode,
    "**Automação:** " + counts.PASS + " PASS / " + counts.FAIL + " FAIL / " + counts.BLOCKED + " BLOCKED",
    "**Homologação operacional:** PENDENTE — este relatório não autoriza GO.",
    "",
    "| ID | Cenário | Resultado | Observação |",
    "| --- | --- | --- | --- |",
    ...scenarios.map(s => "| " + s.id + " | " + s.title + " | " + s.status + " | " +
      (s.reason || "-").replace(/\|/g, "/").replace(/[\r\n]/g, " ") + " |"),
    "", "## Testes manuais não realizados automaticamente",
    "Preencher qa-external/CHECKLIST_MANUAL.md com data, responsável, evidência e decisão.",
    "Não incluir senhas, tokens, cookies ou dados reais neste relatório."
  ];
  await writeFile(resolve(dir, name + ".md"), lines.join("\n") + "\n", { mode: 0o600 });
  console.log("Relatórios locais: " + resolve(dir, name + ".json") + " / " + name + ".md");
  console.log("Resumo: " + JSON.stringify(counts) + "; homologação operacional PENDENTE.");
  return counts.FAIL === 0 && counts.BLOCKED === 0;
}
async function main() {
  if (!["read", "write"].includes(mode)) throw new Error("QA_MODE somente read ou write.");
  apiUrl = normalizeApiUrl(process.env.QA_API_URL);
  webUrl = normalizeWebUrl(process.env.QA_WEB_URL);
  if (mode === "write") assertWriteGuard(process.env, apiUrl);
  await check("SYS-01", "API saudável com banco conectado", async () => {
    const data = await call("/health", {}, 200, "Health");
    if (data?.status !== "ok" || data?.database !== "up") throw new Error("Health não comprova banco saudável.");
  });
  await check("SEC-00", "Leitura anônima de empresas bloqueada", async () => {
    await call("/companies", {}, 401, "Consulta anônima");
  });
  if (webUrl) {
    await check("WEB-01", "Front-end acessível sem redirect inseguro", async () => {
      const r = await fetch(webUrl, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      if (r.status !== 200) throw new Error("Front HTTP " + r.status + " (esperado 200).");
    });
  }
  if (mode === "write") await writeJourneys();
  return report();
}
main().then(ok => { if (!ok) process.exitCode = 1; }).catch(error => {
  console.error("QA bloqueado: " + (error instanceof Error ? error.message : "erro interno"));
  process.exitCode = 2;
});
