# C4.1 — Agenda Comercial — Design

## Contexto

A Fase 1 — MVP Comercial foi encerrada e integrada à `main`. A Fase 2 — Produtividade passa a ser iniciada pela Agenda Comercial, reutilizando o domínio canônico de `Activity` já existente.

O backend atual já oferece os elementos essenciais para uma agenda: `dueAt`, filtros `dueFrom`/`dueTo`, `ownerUserId`, `status`, `type`, `priority` e ordenação por `dueAt`. Portanto, esta entrega não cria um novo domínio de calendário e não duplica dados.

## Objetivo

Entregar uma visão de Agenda Comercial baseada em `Activity`, permitindo ao usuário autorizado consultar tarefas e compromissos com prazo dentro de uma janela temporal, navegar entre períodos e aplicar filtros operacionais sem quebrar isolamento por organização.

## Escopo

### C4.1.1 — Contrato de janela temporal

- manter `GET /api/v1/activities` como fonte da agenda;
- manter `dueFrom` e `dueTo` em ISO 8601 com offset;
- rejeitar consultas nas quais `dueFrom > dueTo`;
- preservar filtros existentes por responsável, status, tipo, prioridade, empresa, contato e oportunidade;
- ordenar por `dueAt` ascendente na agenda;
- manter paginação existente;
- não criar tabela, migration ou endpoint novo.

### C4.1.2 — Visão Web de Agenda

- adicionar seção `agenda` ao shell do CRM;
- exibir a seção apenas para quem possui `activity.read`;
- carregar `Activity` por janela temporal usando `dueFrom`/`dueTo`;
- apresentar os itens agrupados por dia, em ordem cronológica;
- distinguir `TASK` e `APPOINTMENT` por rótulo textual, sem depender apenas de cor;
- exibir pelo menos horário, título, tipo, prioridade e status;
- permitir navegação para período anterior, período atual e próximo período;
- permitir filtros por tipo, status e prioridade;
- estados explícitos de carregamento, vazio e erro;
- nenhuma edição inline nesta primeira versão: criação/alteração continua na tela de Atividades.

### C4.1.3 — Integração, regressão e documentação

- cobertura unitária/integração para a validação da janela temporal;
- cobertura Web para navegação, agrupamento, filtros e RBAC;
- E2E garantindo que um usuário com `activity.read` acessa Agenda e que usuário sem a permissão não recebe a navegação;
- atualização de roadmap/backlog/checkpoint da Fase 2;
- gate completo de CI antes do merge.

## Arquitetura

A Agenda é uma projeção de leitura do agregado `Activity`. O browser calcula a janela temporal selecionada e consulta `GET /api/v1/activities` com `dueFrom`, `dueTo`, `sortBy=dueAt` e `sortOrder=asc`. A API continua aplicando tenant isolation via principal autenticado e `PrismaService.withTenant()`.

Não haverá armazenamento de eventos duplicado, sincronização paralela nem entidade `CalendarEvent` nesta fase. Uma atividade sem `dueAt` não pertence a uma janela de agenda e permanece disponível na tela normal de Atividades.

## Contratos e validação

`ActivityListQuerySchema` continua sendo o contrato público. A única regra nova de contrato em C4.1.1 é a coerência temporal:

- somente `dueFrom`: permitido;
- somente `dueTo`: permitido;
- ambos e `dueFrom <= dueTo`: permitido;
- ambos e `dueFrom > dueTo`: `VALIDATION_ERROR`.

A comparação é feita pelos instantes absolutos resultantes dos datetimes com offset.

## Segurança e autorização

- tenant nunca deriva de query string;
- a organização continua derivada do principal autenticado;
- Agenda reutiliza `activity.read` e não cria permissão nova;
- consultas cross-tenant continuam bloqueadas pela camada de aplicação e RLS existente;
- nenhum dado de outra organização pode aparecer em agrupamentos, filtros ou totais.

## UX inicial

A primeira versão será orientada a produtividade e legibilidade, não a um calendário gráfico complexo. O período padrão é semanal, com itens agrupados por dia. Esse formato reduz complexidade e permite validar o fluxo antes de uma eventual grade mensal/drag-and-drop.

Controles mínimos:

- `Anterior`;
- `Hoje`;
- `Próximo`;
- filtro Tipo;
- filtro Status;
- filtro Prioridade.

## Fora do escopo

- calendário mensal gráfico;
- drag-and-drop;
- recorrência de atividades;
- lembretes/notificações;
- integração Google Calendar/Outlook;
- automações;
- IA;
- criação/edição inline na agenda;
- novo endpoint `/agenda`;
- novas tabelas ou migrations;
- novas permissões RBAC.

## Critérios de aceite

1. Uma consulta com `dueFrom > dueTo` é rejeitada com erro de validação.
2. A Agenda lista somente atividades não excluídas do tenant autenticado dentro da janela solicitada.
3. Itens são apresentados em ordem cronológica e agrupados por dia.
4. A navegação semanal altera corretamente `dueFrom`/`dueTo`.
5. Filtros de tipo, status e prioridade são enviados à API e refletidos na tela.
6. Usuário sem `activity.read` não vê acesso à Agenda.
7. Nenhuma migration ou novo domínio persistente é introduzido.
8. Todos os gates existentes (`pnpm verify`, E2E, Compose e builds) permanecem GREEN.
