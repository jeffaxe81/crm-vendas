# C3.5.4 — Web de Atividades

## Resultado

A microentrega integra Atividades ao `CrmShell` canônico do CRM e reutiliza integralmente a API tenant-aware entregue na C3.5.2, sem criar uma segunda fonte de verdade no navegador.

## Base e escopo

- PR: `#14 — C3.5.4 — Activities web workspace`;
- branch: `feat/c3-5-4-activities-web`;
- base da branch: `29dc19eb00de99fa20544d520558b4835f4e17ef`;
- head funcional GREEN antes do commit documental: `e94b16a659a96ac51f981afa566e8acddcf3338f`;
- `ownerUserId` permanece derivado de `session.user.id`;
- navegação depende de `activity.read` e mutações dependem de `activity.write`.

## Evidências TDD

- Navegação/permissão: RED `52bbcebe`, porque a seção Atividades ainda não existia no shell; GREEN principal `cb4d01c5`.
- Status/lista: RED `61883bf8` / `30bedcd8`, porque filtros e listagem ainda não atendiam ao contrato; GREEN principal `b461789a`.
- Busca: RED `940b6438`, porque `q` ainda não era aplicado por submit explícito; GREEN principal `928db448`.
- Vencimento: RED `ac91695c`, porque o estado visual de atividade atrasada ainda não existia; GREEN principal `6e5845f2`.
- Criação vinculada: RED `c7823764`, porque o formulário self-owned e os vínculos ainda não existiam; GREEN principal `0c519581`.
- Concluir: RED `0bdbe9f3` / `37367571`, porque o botão/ação Concluir estava ausente; GREEN principal `4f91fed5`.
- Cancelar: RED `29a2138d` / `007b986a`, porque o botão/ação Cancelar estava ausente; GREEN principal `a21f3ed7`.
- Reabrir: RED `96ed2308`, porque o botão/ação Reabrir estava ausente; GREEN principal `8de6962c`.
- Inativar: RED `ee31934e`, porque o botão/DELETE Inativar estava ausente; GREEN principal `6c8096ce`.

A proteção de modo somente leitura foi consolidada em `67379862` e teve o mock tipado/corrigido em `e94b16a6`, sem ampliar o comportamento de produção.

## Funcionalidades entregues

- seção Atividades no `CrmShell` somente para sessões com `activity.read`;
- listagem por `PENDING`, `COMPLETED` e `CANCELLED`;
- busca explícita via parâmetro `q` da API;
- estados de loading, erro, vazio e indicação de atividade atrasada;
- criação de `TASK` e `APPOINTMENT` atribuída ao usuário autenticado;
- vínculos opcionais com Empresa e Contato usando endpoints canônicos;
- lifecycle: concluir, cancelar, reabrir e inativar;
- recarga da lista atual após cada mutação bem-sucedida;
- ausência de controles de mutação para usuários sem `activity.write`.

## Arquivos da entrega funcional

- `apps/web/src/app/activities/activities-lifecycle.test.tsx`;
- `apps/web/src/app/activities/activities-view.test.tsx`;
- `apps/web/src/app/activities/activities-view.tsx`;
- `apps/web/src/app/crm-shell.tsx`;
- `apps/web/src/app/globals.css`;
- `apps/web/src/app/page-activities-navigation.test.tsx`;
- `apps/web/src/app/page.tsx`;
- `tests/e2e/crm-core.spec.ts`;
- `docs/superpowers/specs/2026-09-10-c3-5-4-activities-web-design.md`;
- `docs/superpowers/plans/2026-09-10-c3-5-4-activities-web.md`.

O fechamento documental acrescenta também `CHANGELOG.md` e este checkpoint.

## Testes e CI

O fluxo E2E real foi acrescentado em `a11069be`: login → Atividades → criação de `Follow-up E2E` → conclusão → aba Concluídas → confirmação de persistência.

No head funcional `e94b16a659a96ac51f981afa566e8acddcf3338f`, o GitHub Actions run `34474176693` terminou GREEN em todos os passos relevantes:

- instalação com lockfile;
- geração do Prisma Client;
- deploy de migrations existentes;
- provisionamento do papel da aplicação;
- `pnpm verify` (source, formatação, lint/typecheck, testes e build aplicáveis);
- bootstrap do administrador E2E;
- instalação do Chromium;
- E2E;
- validação do contrato Compose;
- build das imagens de aplicação.

O head documental final deve repetir o workflow completo antes de o PR ser considerado pronto para aprovação humana.

## Limites arquiteturais confirmados

A lista de arquivos modificados no PR funcional não contém arquivo de API backend, Prisma schema, migration ou definição de RBAC. Portanto, a C3.5.4 preserva os contratos e o isolamento multiempresa das entregas anteriores.

Permanecem explicitamente fora desta microentrega:

- `Opportunity`;
- agenda/calendário;
- recorrência;
- notificações;
- automação de follow-up;
- Google/Outlook;
- delegação de responsável;
- alterações de backend, schema, migrations ou RBAC.

## Gate humano

Este checkpoint registra evidências técnicas e **não autoriza merge**. O PR #14 somente pode ser integrado à `main` após o workflow do head final terminar GREEN e existir aprovação explícita do responsável.
