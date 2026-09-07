# Cycle 2 — Working Checkpoint

Última atualização: 2026-09-07 14:41 America/Sao_Paulo

## Branch

- `cycle-2-crm-core`
- PR: #3
- Base do ciclo:
  - branch `main`
  - SHA `f361b744f1fb08ee8a7308f38378eaa44d54d624`

## Último ponto tecnicamente validado

- Task 8 — Contatos Web e relacionamento: **100% concluída**
- Task 9 — jornada E2E e restauração de sessão: **GREEN**
- SHA validado: `1a5c51cfac0ad4c7a3023ceebe899d3c5b37ddb5`
- Gate: GitHub Actions run **#277** (`34148399712`)
- Resultado: **GREEN integral**
  - install locked dependencies: success
  - Prisma generate: success
  - migrations: success
  - `pnpm verify`: success
  - bootstrap E2E: success
  - Playwright E2E: success
  - Compose contract: success
  - Docker build API/Web: success

## Funcionalidades validadas até este checkpoint

- Empresas Web integrada ao App Shell
- Contatos Web integrado ao App Shell
- criação de contato sem empresa
- canais de contato
- vínculo empresa–contato
- histórico de relacionamento
- tags: link/unlink
- campos customizados CONTACT: carregar, editar e persistir
- navegação autenticada real para Contatos
- restauração da sessão por refresh cookie após reload
- proteção contra rotação duplicada de refresh em React Strict Mode
- E2E CRM Core:
  - login
  - criação de empresa
  - criação de contato independente
  - inclusão de canal de e-mail
  - vínculo empresa–contato
  - registro de histórico
  - reload
  - verificação de empresa, contato, canal e histórico persistidos

## Revisão de segurança em andamento

Confirmado por código e testes de integração:

- Empresas: leitura e mutação por ID isoladas por `organizationId`
- Contatos e canais: leitura e mutação isoladas por `organizationId`
- Empresa–contato: ambos os lados precisam existir na organização ativa
- Histórico: entidades excluídas ou de outra organização são rejeitadas
- Tags: tag e alvo são validados na organização ativa
- Campos customizados: definição, escopo e alvo são validados por organização
- VIEWER: escrita de Empresas e Contatos retorna 403

Ainda falta fechar formalmente a revisão de auditoria sem segredos e consolidar
a evidência final da Task 9.

## Próximo ponto exato

Task 9 — concluir documentação, revisão de segurança e gate final do Cycle 2.

Próximas ações:

1. confirmar auditoria de autenticação sem senha/hash/token em evidência automatizada;
2. atualizar `README.md`, `CHANGELOG.md` e `docs/testing/README.md` para o Cycle 2;
3. atualizar o checklist do PR #3;
4. executar um gate integral fresco no SHA final de documentação/revisão;
5. apresentar o relatório pós-testes para aprovação;
6. somente após aprovação: criar `v0.2.0-crm-core` no SHA validado e integrar ao
   `main` conforme a regra do Prompt Master.

## Regra de checkpoint operacional

Durante o trabalho ativo, registrar checkpoints frequentes no Git sempre que
houver avanço material, com alvo operacional de aproximadamente 5 minutos.
Esses checkpoints de trabalho **não substituem** o checkpoint de release e não
devem mover tags aprovadas.
