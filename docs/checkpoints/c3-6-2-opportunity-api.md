# Checkpoint — C3.6.2 Opportunity Tenant-Aware API

## Estado da entrega

- branch canônica: `feat/c3-6-2-opportunity-api`;
- PR: #17;
- base empilhada: `feat/c3-6-1-opportunity-foundation` no head `40d20a6b11ca8db973cc3fa817801f759aef19bb` enquanto a C3.6.1 não estiver integrada em `main`;
- head funcional validado antes da documentação final: `9abe334caec42d07f3aea026333e0da9d5b39758`;
- PR permanece Draft e o merge permanece bloqueado até aprovação humana explícita;
- o SHA definitivo da Task 6 e seu workflow GREEN são registrados no body do PR #17 após o gate final, evitando alterar novamente este checkpoint e invalidar o head verificado.

## Escopo entregue

A C3.6.2 entrega a API REST tenant-aware de Oportunidades sobre a fundação C3.6.1:

- `GET /api/v1/opportunities` para listagem paginada, busca e filtros;
- `GET /api/v1/opportunities/:id` para leitura tenant-aware;
- `POST /api/v1/opportunities` para criação;
- `PATCH /api/v1/opportunities/:id` para edição cadastral;
- `PATCH /api/v1/opportunities/:id/stage` para movimentação controlada dentro do Pipeline atual;
- `DELETE /api/v1/opportunities/:id` com soft delete.

O contrato público representa `estimatedValue` como string decimal, preservando `Decimal(19,2)` sem conversão para `number` JavaScript. A oportunidade continua vinculada a exatamente um cliente (`Company` XOR `Contact`).

## Tenant isolation e integridade

- `organizationId` é derivado exclusivamente do principal autenticado e nunca aceito do payload público;
- operações de dados de Opportunity usam `PrismaService.withTenant()`;
- RLS `ENABLE` + `FORCE ROW LEVEL SECURITY` da C3.6.1 permanece fail-closed;
- leitura ou mutação cross-tenant retorna 404 sem revelar existência;
- Company/Contact precisam pertencer ao tenant e não estar soft-deleted;
- owner precisa possuir membership ativa na organização;
- Pipeline e Stage precisam estar ativos e pertencer ao mesmo tenant;
- Stage de movimentação precisa pertencer ao Pipeline atual; troca de Pipeline não faz parte desta entrega.

## RBAC

Nenhuma permissão nova foi criada. A API reutiliza:

- `opportunity.read` para list/read;
- `opportunity.write` para create/update/delete;
- `opportunity.move` para movimentação de Stage.

Os testes adversariais cobrem VIEWER somente leitura e SELLER com operações comerciais autorizadas.

## Concorrência e auditoria

PATCH cadastral e movimentação de Stage usam `version` como compare-and-swap. Toda mutação válida incrementa a versão; tentativa stale retorna `409 OPPORTUNITY_VERSION_CONFLICT`.

Eventos auditados:

- `opportunity.created`;
- `opportunity.updated`;
- `opportunity.moved`;
- `opportunity.deleted`.

Os registros incluem organização, ator, requestId, entidade e versões; movimentação registra Pipeline, Stage de origem e destino.

## Evidência TDD e CI

### Task 1 — Public Opportunity Contracts

- RED: workflow `34506989975`;
- GREEN: workflow `34507680930`.

### Task 2 — Create, Read and List

- RED: workflow `34508172577`;
- implementação principal: `ed5009e443a18ee1ee8d6999ed8fbe1e14141c8f`;
- GREEN: workflow `34508591833`.

### Task 3 — General PATCH + optimistic concurrency

- RED: workflow `34510227411`;
- implementação: `e4e995a3a93932a61b7256c2fdea9c2de38e9a8f`;
- formatação: `726f254f3cc73f8f240df8781e4c31deedb5d70b`;
- GREEN: workflow `34511120375`.

### Task 4 — Controlled Stage Movement

- RED: workflow `34511662841`, com os testes anteriores GREEN e os novos cenários falhando pela ausência do endpoint;
- implementação: `9efd043d61cc46984e85e29c4a8726e96f269de8`;
- GREEN completo: workflow `34512219542`.

### Task 5 — Soft Delete, RBAC, Cross-Tenant and Audit Boundaries

- RED funcional: workflow `34519278259`, com 72 testes passando e 3 falhando exclusivamente pelos cenários de DELETE ainda ausentes;
- implementação de soft delete: head funcional `4943a2980fecb6df0147f82b44cb51fe8254e400`;
- a primeira tentativa de GREEN expôs somente uma falha no teste, que consultava `opportunities` fora do tenant e era corretamente bloqueada pelo `FORCE RLS`;
- a verificação do teste foi corrigida para consultar a linha soft-deleted dentro de `withTenant()`, sem ampliar código de produção;
- head funcional limpo após remoção dos artefatos diagnósticos: `9abe334caec42d07f3aea026333e0da9d5b39758`;
- GREEN completo: workflow `34520470648`, incluindo dependências congeladas, Prisma generate/migrations, role de aplicação, source/tests, E2E, Compose contract e builds das imagens.

## Task 6 — documentação e gate final

Este checkpoint e o `CHANGELOG.md` constituem a documentação final da microentrega. Após o commit documental, deve ser executado `pnpm verify` e um GitHub Actions completo sobre o SHA definitivo. O SHA e o run final ficam registrados no PR #17 depois da evidência GREEN.

## Fora do escopo

Permanecem deliberadamente fora da C3.6.2:

- Web/Kanban e drag-and-drop;
- troca de Pipeline;
- vínculo `Activity` → `Opportunity`;
- histórico dedicado de movimentações além do AuditLog;
- forecast/probabilidade avançados;
- multi-moeda;
- produtos, propostas e comissões;
- automações, alertas, integrações e IA;
- novas permissões RBAC.

## Gate de integração

A conclusão técnica da C3.6.2 exige evidência fresca no SHA documental definitivo. Mesmo após GREEN, o PR #17 deve permanecer Draft e **não pode ser mergeado** sem aprovação humana explícita. Como a entrega está empilhada, sua integração também depende da C3.6.1 estar corretamente integrada ou de a base do PR ser atualizada e revalidada antes do merge.
