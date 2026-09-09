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
- [ ] Task 2 — schema Prisma e migration
- [ ] Task 3 — permissões e autorização
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

Estado: iniciando RED.
