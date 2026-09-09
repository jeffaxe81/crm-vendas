# Cycle 3 — Current Checkpoint

Status: em implementação.

Branch: `cycle-3-sales-pipeline`.

Spec: `docs/superpowers/specs/2026-09-08-cycle-3-sales-pipeline-design.md`.

Plano: `docs/superpowers/plans/2026-09-08-cycle-3-sales-pipeline.md`.

Checkpoint alvo: `v0.3.0-sales-pipeline`.

## Progresso

- [x] Design aprovado
- [x] Plano TDD aprovado
- [x] Task 1 — contratos compartilhados
- [x] Task 2 — schema Prisma e migration
- [x] Task 3 — permissões e autorização
- [x] Task 4 — API de funis
- [x] Task 5 — API de etapas
- [ ] Task 6 — API de oportunidades
- [ ] Task 7 — movimentação e histórico
- [ ] Task 8 — fechamento WON/LOST
- [ ] Task 9 — Web lista/formulário/detalhe
- [ ] Task 10 — Kanban básico
- [ ] Task 11 — testes adversariais multiempresa
- [ ] Task 12 — E2E
- [ ] Task 13 — documentação e rollback
- [ ] Task 14 — gate integral
- [ ] Task 15 — aprovação pós-testes e merge

Progresso operacional: `████████░░░░░░░░░░░░ 40%` — 6 de 15 tasks concluídas considerando design/plano como pré-condições e Tasks 1–5 fechadas.

## Estado TDD atual

### Task 1 — contratos compartilhados

- RED: commit `9a1c02e4c0e61715d24e5ae853b63a64124b9280`.
- GREEN integral: SHA `2eabd79d69fbe3974314a57c13b1e5ac166d9ed4`.
- GitHub Actions: run `34294054642` / gate #293.
- Resultado: instalação, Prisma Client, migrations existentes, format, lint, typecheck, testes, build, E2E, Compose e imagens Docker aprovados.

### Task 2 — schema Prisma e migration

- RED funcional: SHA `c558b32a5c4e6eca968fed51e371e39589e0e278`.
- GitHub Actions RED: run `34294654491` / gate #299.
- Falha esperada: ausência de `OpportunityStatus`, dos quatro models do Ciclo 3 e da migration `cycle3_sales_pipeline`.
- Implementação: schema Prisma tenant-scoped + migration `20260909002000_cycle3_sales_pipeline`.
- GREEN integral: SHA `43dc348e25ae730caf736380a767dc4454ebc13f`.
- GitHub Actions GREEN: run `34294924101` / gate #301.
- Resultado: Prisma Client, três migrations em PostgreSQL vazio, format, lint, typecheck, testes, build, E2E, Compose e imagens Docker aprovados.

### Task 3 — permissões e autorização

- RED: SHA `db5d1c43390b33c11c127eb89871c9db824e7b20`.
- GitHub Actions RED: run `34295294139` / gate #303.
- Falha esperada: `pipeline.read` e `pipeline.write` ausentes do tipo `Permission` e do mapa RBAC.
- Implementação: extensão mínima do RBAC existente; `VIEWER` recebe somente `pipeline.read`; `ADMIN`, `MANAGER` e `SELLER` recebem leitura/escrita comercial.
- GREEN integral: SHA `43c68831564a106e6c2fef9d41621d1ff68d814a`.
- GitHub Actions GREEN: run `34295387469` / gate #304.
- Resultado: Prisma/migrations, format, lint, typecheck, testes, build, E2E, Compose e imagens Docker aprovados.

### Task 4 — API de funis

- RED: SHA `98a06f019bfc6d393dcb13361912dce0f675e907`.
- GitHub Actions RED: run `34295725336` / gate #306.
- Falha esperada: `POST /api/v1/pipelines` retornava 404; 43 testes anteriores permaneceram verdes.
- Implementação: `PipelinesModule`, controller e service tenant-scoped; create/list/get/update, 404 cross-tenant e auditoria de create/update; registro no `AppModule`.
- GREEN integral: SHA `e553aa4888247a3b37acf1a19d1eac0ed4692f38`.
- GitHub Actions GREEN: run `34295908264` / gate #310.
- Resultado: Prisma/migrations, format, lint, typecheck, testes, build, E2E, Compose e imagens Docker aprovados.

### Task 5 — API de etapas e ordenação

- RED da microfatia de etapas: SHA `c65e016988168a7e0eb053859d5c1e2dad5fa806`.
- GitHub Actions RED: run `34296226743` / gate #312.
- Falha esperada: `POST /api/v1/pipelines/:id/stages` retornava 404; 44 testes anteriores permaneceram verdes.
- Implementação: create/update/reorder/deactivate de etapas, validação integral do pipeline/tenant, rejeição de ids externos ao pipeline e reorder em duas fases para preservar unicidade de posição.
- GREEN integral da microfatia: SHA `b160b1f4ea3963a473adf6205e7d834298181688`.
- GitHub Actions GREEN: run `34296487551` / gate #314.
- RED funcional da regra de pipeline padrão: SHA `110901c83043ff9c016f76d7d6a766df329663db`.
- GitHub Actions RED: run `34297336628` / gate #318.
- Falha esperada: primeiro funil criado com `isDefault=false` permanecia sem default; 44 testes anteriores passaram e somente as duas asserções da nova regra falharam.
- Implementação: criação/alteração de pipeline serializada por lock transacional da organização; primeiro pipeline torna-se default automaticamente; promoção de novo default remove o anterior dentro da mesma transação; índice único parcial do PostgreSQL permanece como defesa adicional.
- GREEN integral da Task 5: SHA `2a0c69edfa2d8ee05c085dd4438ec527af50eb93`.
- GitHub Actions GREEN: run `34297499658` / gate #319.
- Resultado: migrations, format, lint, typecheck, 46 testes de API/contratos/repos, build, E2E, Compose e imagens Docker aprovados.

### Task 6 — API de oportunidades

Estado: iniciando RED para criação válida e rejeições cross-tenant de empresa, contato, responsável, pipeline e etapa. Nenhuma implementação de Opportunities deve entrar antes desse RED funcional.
