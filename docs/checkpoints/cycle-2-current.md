# Cycle 2 — Working Checkpoint

Última atualização: 2026-09-07 14:29 America/Sao_Paulo

## Branch

- `cycle-2-crm-core`
- PR: #3
- Base do ciclo:
  - branch `main`
  - SHA `f361b744f1fb08ee8a7308f38378eaa44d54d624`

## Último ponto tecnicamente validado

- Task 8 — Contatos Web e relacionamento: **100% concluída**
- SHA validado: `b4ae7042b4ae9e1393d47f488a697d8964572baf`
- Gate: GitHub Actions run **#257** (`34128540924`)
- Resultado: **GREEN integral**
  - install locked dependencies: success
  - Prisma generate: success
  - migrations: success
  - `pnpm verify`: success
  - bootstrap E2E: success
  - Playwright E2E: success
  - Compose contract: success
  - Docker build API/Web: success

## Funcionalidades encerradas até este checkpoint

- Empresas Web integrada ao App Shell
- Contatos Web integrado ao App Shell
- criação de contato sem empresa
- canais de contato
- vínculo empresa–contato
- histórico de relacionamento
- tags: link/unlink
- campos customizados CONTACT: carregar, editar e persistir
- navegação autenticada real para Contatos

## Próximo ponto exato

Task 9 — E2E, cobertura adversarial, documentação e gate final.

Próxima ação TDD:

1. criar `tests/e2e/crm-core.spec.ts` com a jornada completa;
2. rodar RED e confirmar a primeira falha comportamental;
3. implementar somente o necessário para GREEN;
4. atualizar documentação e evidências;
5. executar gate integral fresco em um único SHA;
6. revisão final de segurança;
7. somente após GREEN integral e aprovação pós-testes: checkpoint de release
   `v0.2.0-crm-core` e merge.

## Regra de checkpoint operacional

Durante o trabalho ativo, registrar checkpoints frequentes no Git sempre que
houver avanço material, com alvo operacional de aproximadamente 5 minutos.
Esses checkpoints de trabalho **não substituem** o checkpoint de release e não
devem mover tags aprovadas.
