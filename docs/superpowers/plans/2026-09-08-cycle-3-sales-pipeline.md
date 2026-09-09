# Cycle 3 — Sales Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o núcleo comercial enxuto do CRM com funis, etapas, oportunidades, movimentação rastreável, ganho/perda, interface Web e isolamento multiempresa.

**Architecture:** Evoluir o monorepo atual sem criar novos serviços. O domínio comercial ficará modularizado na API NestJS, com contratos TypeScript compartilhados, persistência PostgreSQL/Prisma, Web Next.js e reutilização integral da autenticação, RBAC, auditoria, tratamento de erros e padrões multiempresa já consolidados nos Ciclos 1 e 2.

**Tech Stack:** TypeScript, NestJS, Next.js, PostgreSQL, Prisma, Vitest/Jest conforme pacote existente, Playwright, Docker Compose, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-08-cycle-3-sales-pipeline-design.md`

## Global Constraints

- Todo recurso comercial deve ser isolado por `organizationId`.
- `VIEWER` é somente leitura.
- Cross-tenant deve retornar 404 quando a existência do recurso não puder ser revelada.
- Movimentação de etapa deve ser operação de domínio explícita e gerar histórico append-only.
- Oportunidades fechadas não podem ser reabertas neste ciclo.
- Atividades, agenda, dashboard, forecast avançado, produtos, propostas, automações e integrações externas estão fora do escopo.
- Drag-and-drop não é requisito bloqueante; mudança explícita de etapa é suficiente para aceite.
- Nenhum merge em `main` antes de gate integral verde e aprovação pós-testes explícita.
- Checkpoint alvo: `v0.3.0-sales-pipeline`.

---

## Mapa de arquivos

Arquivos existentes a reutilizar/modificar:

- `apps/api/prisma/schema.prisma` — modelo persistente e relações.
- `apps/api/src/app.module.ts` — registro dos módulos do domínio comercial.
- `apps/api/src/authorization/**` — permissões e guards existentes.
- `apps/api/src/audit/**` — auditoria existente.
- `apps/api/src/companies/**` — padrão de CRUD, tenant e auditoria para referência.
- `apps/api/src/contacts/**` — validação de contato e cross-tenant para referência.
- `apps/api/src/database/**` — Prisma service/repositórios existentes.
- `apps/web/**` — App Shell e padrões das telas de Empresas/Contatos.
- `packages/contracts/**` — contratos compartilhados existentes.
- `e2e/**` ou diretório Playwright equivalente já existente — jornada ponta a ponta.
- `.github/workflows/**` — gate integral existente, sem introduzir workflow paralelo.

Novas áreas esperadas:

- `apps/api/src/pipelines/**` — funis e etapas.
- `apps/api/src/opportunities/**` — oportunidades, movimentação e fechamento.
- contratos correspondentes em `packages/contracts`.
- rotas/telas de oportunidades no app Web seguindo o padrão atual.

---

### Task 1: Contratos compartilhados do pipeline e oportunidades

**Files:**
- Modify/Create em `packages/contracts/src/**` seguindo a organização existente.
- Test: arquivos de contrato correspondentes no mesmo pacote.

**Interfaces:**
- Produces: `OpportunityStatus = 'OPEN' | 'WON' | 'LOST'`.
- Produces DTOs para `Pipeline`, `PipelineStage`, `Opportunity`, filtros, criação, edição, movimentação e fechamento.
- Produces permissões públicas `pipeline.read`, `pipeline.write`, `opportunity.read`, `opportunity.write`, caso o modelo atual permita granularidade equivalente.

- [ ] **Step 1: escrever testes falhos dos contratos** cobrindo shape obrigatório, enums, filtros e rejeição de payloads inválidos.
- [ ] **Step 2: executar somente os testes do pacote contracts** e confirmar RED por ausência dos contratos novos.
- [ ] **Step 3: implementar o mínimo necessário** para expor tipos/schemas e validações sem lógica de negócio duplicada.
- [ ] **Step 4: executar novamente os testes de contracts** e confirmar GREEN.
- [ ] **Step 5: executar typecheck do pacote** para provar compatibilidade de tipos.
- [ ] **Step 6: commit** `feat(contracts): add sales pipeline contracts`.

Critérios específicos:
- `companyId` obrigatório; `contactId` opcional.
- `ownerUserId`, `pipelineId`, `stageId`, título e valor são obrigatórios na criação.
- moeda deve ser explícita, inicialmente como código textual estável, sem conversão cambial.
- fechamento deve aceitar `WON` ou `LOST`, e motivo opcional apenas para perda.

---

### Task 2: Schema Prisma e migration reproduzível

**Files:**
- Modify: `apps/api/prisma/schema.prisma`.
- Create: `apps/api/prisma/migrations/<timestamp>_cycle3_sales_pipeline/migration.sql`.
- Test: testes de repositório/migration existentes.

**Interfaces:**
- Produces models: `Pipeline`, `PipelineStage`, `Opportunity`, `OpportunityStageHistory`.
- Produces enum persistente equivalente a `OpportunityStatus`.

- [ ] **Step 1: escrever/ajustar teste de schema ou repositório** esperando as novas entidades e constraints.
- [ ] **Step 2: executar teste e confirmar RED**.
- [ ] **Step 3: adicionar ao Prisma** relações com `Organization`, `Company`, `Contact`, `User`, índices por tenant/status/stage e timestamps.
- [ ] **Step 4: gerar migration versionada** e garantir que não apaga/reescreve dados existentes dos Ciclos 1 e 2.
- [ ] **Step 5: aplicar migrations em PostgreSQL vazio** desde zero.
- [ ] **Step 6: gerar Prisma Client e executar testes de schema/repositório**.
- [ ] **Step 7: commit** `feat(db): add sales pipeline schema`.

Regras de integridade obrigatórias:
- cada entidade carrega `organizationId` quando necessário para filtros seguros;
- `PipelineStage` pertence a um único `Pipeline`;
- oportunidade referencia pipeline, etapa, empresa, contato opcional e responsável;
- histórico registra `fromStageId?`, `toStageId`, `actorUserId`, `occurredAt`;
- histórico não recebe endpoints de update/delete.

---

### Task 3: Permissões e autorização do domínio comercial

**Files:**
- Modify: `apps/api/src/authorization/**`.
- Test: suíte de autorização existente.

**Interfaces:**
- Consumes: permissões definidas na Task 1.
- Produces: guards/permission mapping para pipeline e oportunidades.

- [ ] **Step 1: escrever testes falhos** provando que `VIEWER` lê e não escreve, e que perfis comerciais autorizados preservam o padrão atual.
- [ ] **Step 2: executar testes de autorização e confirmar RED**.
- [ ] **Step 3: implementar a menor extensão no RBAC existente**; não criar mecanismo paralelo.
- [ ] **Step 4: executar testes de autorização e confirmar GREEN**.
- [ ] **Step 5: commit** `feat(authz): add sales pipeline permissions`.

---

### Task 4: API de Funis

**Files:**
- Create: `apps/api/src/pipelines/pipelines.module.ts`.
- Create: controller/service/repository e testes seguindo o padrão de `companies`.
- Modify: `apps/api/src/app.module.ts`.

**Interfaces:**
- Produces operações: create/list/get/update pipeline.
- Todo método recebe o tenant ativo derivado da sessão, nunca de um `organizationId` confiado do cliente.

- [ ] **Step 1: escrever testes falhos** para criar/listar/consultar/editar com tenant isolation.
- [ ] **Step 2: rodar somente a suíte `pipelines` e confirmar RED**.
- [ ] **Step 3: implementar repositório tenant-scoped**.
- [ ] **Step 4: implementar service com regras de domínio e auditoria**.
- [ ] **Step 5: implementar controller com RBAC existente**.
- [ ] **Step 6: rodar testes unitários/integração e confirmar GREEN**.
- [ ] **Step 7: commit** `feat(api): add pipelines`.

Critérios:
- cross-tenant retorna 404;
- edição não transfere pipeline entre organizações;
- inativação lógica é preferida a delete físico.

---

### Task 5: API de Etapas e ordenação

**Files:**
- Create/Modify: `apps/api/src/pipelines/**`.
- Test: suíte `pipelines`.

**Interfaces:**
- Produces operações de create/update/reorder/deactivate stage.

- [ ] **Step 1: escrever testes falhos** para criação, ordenação, inativação e cross-tenant.
- [ ] **Step 2: confirmar RED**.
- [ ] **Step 3: implementar posições ordenáveis estáveis** e validação de pipeline do tenant ativo.
- [ ] **Step 4: garantir um pipeline padrão por organização** usando regra idempotente, sem duplicação concorrente.
- [ ] **Step 5: confirmar GREEN na suíte pipelines**.
- [ ] **Step 6: commit** `feat(api): add pipeline stages`.

Regra de aceite:
- uma etapa não pode ser usada por pipeline/tenant diferente;
- reorder não pode aceitar ids de etapa que não pertençam integralmente ao pipeline alvo.

---

### Task 6: API de Oportunidades — criação, consulta, edição e filtros

**Files:**
- Create: `apps/api/src/opportunities/opportunities.module.ts`.
- Create: controller/service/repository e testes.
- Modify: `apps/api/src/app.module.ts`.

**Interfaces:**
- Produces create/list/get/update/filter opportunities.
- Consumes validações existentes de Company, Contact e membership/User por tenant.

- [ ] **Step 1: escrever testes falhos** para criação válida e rejeições cross-tenant de empresa, contato, responsável, pipeline e etapa.
- [ ] **Step 2: confirmar RED**.
- [ ] **Step 3: implementar validações tenant-scoped antes de persistir**.
- [ ] **Step 4: implementar list/detail/update e filtros por empresa, contato, responsável, etapa e status**.
- [ ] **Step 5: registrar auditoria de create/update sem payload sensível**.
- [ ] **Step 6: confirmar GREEN** em unitários e integração.
- [ ] **Step 7: commit** `feat(api): add opportunities`.

Critérios:
- contato informado deve pertencer ao tenant e ser compatível com o vínculo comercial da empresa;
- responsável deve possuir membership ativa na organização;
- etapa deve pertencer ao pipeline informado.

---

### Task 7: Movimentação entre etapas com histórico append-only

**Files:**
- Modify/Create: `apps/api/src/opportunities/**`.
- Test: suíte específica de stage movement.

**Interfaces:**
- Produces operação explícita `moveOpportunity` equivalente ao padrão de naming do código atual.
- Produces leitura do histórico da oportunidade.

- [ ] **Step 1: escrever testes falhos** para movimento válido, etapa de outro funil, etapa cross-tenant e oportunidade fechada.
- [ ] **Step 2: confirmar RED**.
- [ ] **Step 3: implementar movimentação transacional**: validar oportunidade -> validar etapa -> atualizar `stageId` -> inserir histórico no mesmo commit transacional.
- [ ] **Step 4: impedir qualquer rota de update/delete do histórico**.
- [ ] **Step 5: validar auditoria da movimentação**.
- [ ] **Step 6: confirmar GREEN** inclusive em rollback transacional quando o histórico não puder ser persistido.
- [ ] **Step 7: commit** `feat(api): add opportunity stage movement history`.

---

### Task 8: Fechamento WON/LOST

**Files:**
- Modify: `apps/api/src/opportunities/**`.
- Test: suíte de oportunidade.

**Interfaces:**
- Produces operação de fechamento com `WON | LOST`.

- [ ] **Step 1: escrever testes falhos** para ganho, perda, motivo opcional, fechamento repetido e tentativa de reabertura.
- [ ] **Step 2: confirmar RED**.
- [ ] **Step 3: implementar transição `OPEN -> WON|LOST` apenas**.
- [ ] **Step 4: devolver conflito de estado pelo padrão de erro existente quando já fechada**.
- [ ] **Step 5: registrar auditoria de fechamento**.
- [ ] **Step 6: confirmar GREEN**.
- [ ] **Step 7: commit** `feat(api): add opportunity closing`.

---

### Task 9: Web — lista, formulário e detalhe

**Files:**
- Create/Modify em `apps/web` seguindo o App Shell e os padrões de Empresas/Contatos.
- Test: testes Web existentes.

**Interfaces:**
- Consumes endpoints/contratos das Tasks 4–8.

- [ ] **Step 1: escrever testes de UI falhos** para listagem, criação, edição e detalhe.
- [ ] **Step 2: confirmar RED**.
- [ ] **Step 3: adicionar navegação `Oportunidades` no App Shell sem quebrar menu existente**.
- [ ] **Step 4: implementar lista e filtros essenciais**.
- [ ] **Step 5: implementar formulário de criação/edição com seleção de empresa, contato, responsável, funil e etapa**.
- [ ] **Step 6: implementar detalhe com status e histórico de etapas**.
- [ ] **Step 7: confirmar GREEN** na suíte Web e typecheck.
- [ ] **Step 8: commit** `feat(web): add opportunity screens`.

---

### Task 10: Web — Kanban básico

**Files:**
- Create/Modify: componentes de oportunidades em `apps/web`.
- Test: testes Web específicos.

**Interfaces:**
- Consumes operação de movimentação da Task 7.

- [ ] **Step 1: escrever testes falhos** para renderizar colunas em ordem e mover oportunidade por ação explícita.
- [ ] **Step 2: confirmar RED**.
- [ ] **Step 3: implementar Kanban básico por `PipelineStage`**.
- [ ] **Step 4: implementar mudança de etapa por controle explícito; drag-and-drop somente se não aumentar significativamente a superfície de risco**.
- [ ] **Step 5: manter `WON/LOST` fora do fluxo aberto e com indicação visual própria**.
- [ ] **Step 6: confirmar GREEN**.
- [ ] **Step 7: commit** `feat(web): add sales pipeline board`.

---

### Task 11: Testes adversariais multiempresa

**Files:**
- Modify/Create testes de integração da API.

**Interfaces:**
- Verifica todos os endpoints de pipeline/opportunity contra dois tenants reais de teste.

- [ ] **Step 1: escrever matriz adversarial falha** cobrindo leitura, escrita, movimento e fechamento cross-tenant.
- [ ] **Step 2: executar e confirmar RED onde houver lacuna**.
- [ ] **Step 3: corrigir somente as lacunas encontradas sem alterar o contrato funcional aprovado**.
- [ ] **Step 4: confirmar GREEN da matriz completa**.
- [ ] **Step 5: commit** `test: harden sales pipeline tenant isolation`.

Casos mínimos:
- empresa B em oportunidade A;
- contato B em oportunidade A;
- owner B em oportunidade A;
- pipeline/etapa B em oportunidade A;
- leitura de oportunidade B pelo tenant A;
- mover oportunidade A para etapa B;
- fechar oportunidade B pelo tenant A.

---

### Task 12: E2E do fluxo comercial

**Files:**
- Modify/Create: suíte Playwright existente.

**Interfaces:**
- Exercita Web + API + PostgreSQL real de teste.

- [ ] **Step 1: escrever cenário E2E falho** cobrindo login -> empresa -> oportunidade -> movimento -> fechamento -> reload -> persistência.
- [ ] **Step 2: executar E2E e confirmar RED antes dos ajustes finais necessários**.
- [ ] **Step 3: corrigir apenas problemas observados na jornada real**.
- [ ] **Step 4: adicionar cenário adversarial cross-tenant de ponta a ponta ou equivalente de integração quando isolamento de sessão exigir setup específico**.
- [ ] **Step 5: executar Playwright e confirmar GREEN**.
- [ ] **Step 6: commit** `test(e2e): cover sales pipeline journey`.

---

### Task 13: Reconciliação documental

**Files:**
- Modify: `docs/roadmap.md`.
- Modify: `docs/backlog-do-produto.md`.
- Modify: `docs/decisoes-riscos-e-versoes.md` se aplicável.
- Create/Modify: `docs/checkpoints/cycle-3-current.md`.

- [ ] **Step 1: corrigir marcações herdadas** que dizem que Oportunidades, Atividades e Painel já existem na nova arquitetura.
- [ ] **Step 2: distinguir explicitamente** `legado/anterior`, `nova arquitetura concluída`, `em implementação`, `planejado` e `fora de escopo`.
- [ ] **Step 3: registrar rollback no estado pós-Ciclo 2**.
- [ ] **Step 4: registrar checkpoint alvo `v0.3.0-sales-pipeline` sem criá-lo antes do gate integral e aprovação**.
- [ ] **Step 5: rodar Prettier/checagem documental existente**.
- [ ] **Step 6: commit** `docs: reconcile CRM roadmap for Cycle 3`.

---

### Task 14: Gate integral candidato

**Files:**
- Nenhuma mudança funcional esperada; somente correções se o gate revelar falha real.

- [ ] **Step 1: instalar dependências com lockfile congelado** usando o comando padrão do workflow atual.
- [ ] **Step 2: gerar Prisma Client**.
- [ ] **Step 3: subir PostgreSQL vazio e aplicar todas as migrations desde zero**.
- [ ] **Step 4: executar formatter/check documental**.
- [ ] **Step 5: executar lint**.
- [ ] **Step 6: executar typecheck**.
- [ ] **Step 7: executar testes de repositório/contratos/Web/API**.
- [ ] **Step 8: executar Playwright E2E**.
- [ ] **Step 9: validar `docker compose config --quiet`**.
- [ ] **Step 10: construir imagens Docker API e Web**.
- [ ] **Step 11: confirmar que todas as etapas verdes pertencem ao mesmo SHA candidato**.
- [ ] **Step 12: registrar no checkpoint o SHA, run e job do GitHub Actions**.

Se qualquer etapa falhar: o ciclo permanece não concluído, corrigir via TDD e reexecutar gate integral em novo SHA.

---

### Task 15: Aprovação e integração controlada

**Files:**
- PR do branch `cycle-3-sales-pipeline` contra `main`.

- [ ] **Step 1: abrir/manter PR em draft durante implementação**.
- [ ] **Step 2: preencher PR com escopo, testes, segurança, rollback e evidência do gate integral**.
- [ ] **Step 3: solicitar aprovação pós-testes explícita ao responsável**.
- [ ] **Step 4: somente após aprovação, marcar PR ready for review**.
- [ ] **Step 5: criar checkpoint/tag `v0.3.0-sales-pipeline` se a ferramenta disponível suportar tag real; caso contrário registrar claramente a limitação sem afirmar criação**.
- [ ] **Step 6: fazer merge com proteção pelo SHA esperado do candidato validado**.
- [ ] **Step 7: verificar `main` após o merge e registrar SHA final**.
- [ ] **Step 8: não remover branch/worktree até a verificação final e decisão de limpeza**.

---

## Self-review do plano

- Cobertura da spec: contratos, modelo, funis, etapas, oportunidades, movimentação, histórico, ganho/perda, Web, Kanban, RBAC, multiempresa, auditoria, E2E, documentação, rollback e gate estão mapeados.
- Escopo: Atividades e Dashboard permanecem explicitamente fora.
- Tipos: `OPEN | WON | LOST`, `Pipeline`, `PipelineStage`, `Opportunity`, `OpportunityStageHistory` são consistentes entre tarefas.
- Segurança: toda mutação e leitura sensível exige tenant ativo e RBAC existente.
- Integração: nenhuma task cria serviço paralelo ou mecanismo alternativo de autenticação/auditoria.
- Gate: nenhum merge é autorizado antes de mesmo SHA verde + aprovação explícita.
