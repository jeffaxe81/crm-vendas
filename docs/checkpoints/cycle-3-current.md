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
- [ ] Task 4 — API de funis
- [ ] Task 5 — API de etapas
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

Estado: iniciando RED para create/list/get/update tenant-scoped e 404 cross-tenant.
