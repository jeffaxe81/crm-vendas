# Cycle 2 — Working Checkpoint

Última atualização: 2026-09-07 14:47 America/Sao_Paulo

## Branch

- `cycle-2-crm-core`
- PR: #3
- Base do ciclo:
  - branch `main`
  - SHA `f361b744f1fb08ee8a7308f38378eaa44d54d624`

## Último ponto tecnicamente validado

- Task 8 — Contatos Web e relacionamento: **100% concluída**
- Task 9 — jornada E2E e restauração de sessão: **GREEN**
- Último SHA com gate integral verde:
  `1a5c51cfac0ad4c7a3023ceebe899d3c5b37ddb5`
- Gate verde: GitHub Actions run **#277** (`34148399712`)
- Resultado do #277: **GREEN integral**
  - install locked dependencies: success
  - Prisma generate: success
  - migrations: success
  - `pnpm verify`: success
  - bootstrap E2E: success
  - Playwright E2E: success
  - Compose contract: success
  - Docker build API/Web: success

## Funcionalidades validadas

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

## Revisão final de segurança

Concluída por leitura de código e evidências automatizadas:

- Empresas: leitura e mutação por ID isoladas por `organizationId`
- Contatos e canais: leitura e mutação isoladas por `organizationId`
- Empresa–contato: ambos os lados precisam existir na organização ativa
- Histórico: entidades excluídas ou de outra organização são rejeitadas
- Tags: tag e alvo são validados na organização ativa
- Campos customizados: definição, escopo e alvo são validados por organização
- `VIEWER`: escrita de Empresas e Contatos retorna 403
- demais endpoints de escrita do CRM Core exigem explicitamente
  `company.write` e/ou `contact.write`
- auditoria de autenticação é testada para não conter senha nem
  `refreshSession.tokenHash`
- usuário desativado não pode renovar refresh nem realizar novo login

## Documentação final

Concluída na branch:

- `README.md` atualizado para o Cycle 2
- `CHANGELOG.md` com seção Cycle 2 ainda não liberada
- `docs/testing/README.md` atualizado com matriz, controles adversariais e E2E
- rollback documentado em `v0.1.0-identity-access` enquanto o Cycle 2 não for
  aprovado

Último commit antes deste checkpoint:
`bb413a0ece70b065dc072f4391571042313fdda8`.

## Próximo ponto exato

Task 9 — **gate final do Cycle 2**.

Próximas ações:

1. executar o gate integral fresco no SHA gerado por este checkpoint;
2. se houver falha, corrigir somente a causa raiz e registrar novo checkpoint;
3. atualizar o checklist e relatório do PR #3 com a evidência final;
4. apresentar o relatório pós-testes para aprovação;
5. somente após aprovação: criar `v0.2.0-crm-core` no SHA validado e integrar ao
   `main` conforme a regra do Prompt Master.

## Observação não bloqueante

O workflow continua exibindo o nome histórico `Cycle 1 quality gate`. Foi
confirmado que o conteúdo do gate é genérico e mantém todas as etapas exigidas.
A tentativa de renomear apenas o título foi bloqueada pelo filtro de segurança
da ferramenta por o arquivo conter valores de ambiente de teste com aparência
de segredo. Nenhum valor ou etapa do gate foi alterado para contornar isso.

## Regra de checkpoint operacional

Durante o trabalho ativo, registrar checkpoints frequentes no Git sempre que
houver avanço material, com alvo operacional de aproximadamente 5 minutos.
Esses checkpoints de trabalho **não substituem** o checkpoint de release e não
devem mover tags aprovadas.
