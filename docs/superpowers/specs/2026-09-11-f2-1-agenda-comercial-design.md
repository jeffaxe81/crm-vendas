# F2.1 — Agenda Comercial Design

## Status

Design da primeira microentrega da **Fase 2 — Produtividade**, autorizada após o fechamento da Fase 1 — MVP Comercial.

## Contexto atual

O CRM já possui o domínio canônico de `Activity` com tarefas e compromissos, incluindo:

- `type` (`TASK` ou `APPOINTMENT`);
- `status` (`PENDING`, `COMPLETED` ou `CANCELLED`);
- prioridade;
- responsável (`ownerUserId`);
- vínculos opcionais com empresa, contato e oportunidade;
- prazo/data (`dueAt`);
- isolamento por organização e RLS;
- RBAC com `activity.read` e `activity.write`;
- auditoria das mutações.

O contrato público `ActivityListQuerySchema` já suporta `ownerUserId`, `dueFrom`, `dueTo`, paginação e ordenação por `dueAt`. A API `GET /activities` já aplica esses filtros dentro de `PrismaService.withTenant()`.

Por isso, esta entrega **não cria uma segunda entidade de agenda, não cria migration e não cria endpoint paralelo**. A agenda é uma nova projeção de leitura sobre `Activity`.

## Objetivo

Entregar uma **Agenda Comercial semanal** para que o usuário autenticado visualize suas tarefas e compromissos com prazo em uma semana, navegue entre semanas e retorne rapidamente à semana atual.

## Escopo funcional

A primeira versão entrega:

1. nova seção **Agenda** na navegação principal;
2. exibição semanal de segunda-feira a domingo;
3. navegação **Semana anterior**, **Hoje** e **Próxima semana**;
4. consulta somente das atividades do usuário autenticado (`ownerUserId`);
5. consulta somente do intervalo visível (`dueFrom`/`dueTo`);
6. agrupamento por dia no fuso horário local do navegador;
7. ordenação cronológica por `dueAt`;
8. identificação visual de tipo, horário, prioridade e status;
9. destaque do dia atual quando ele estiver na semana visível;
10. estados de carregamento, erro e dia vazio;
11. acesso condicionado à permissão já existente `activity.read`.

## Fora do escopo

Permanecem fora da F2.1:

- agenda de equipe ou troca de responsável pela agenda;
- visão mensal ou diária dedicada;
- drag-and-drop para reagendamento;
- criação/edição de atividade dentro do calendário;
- recorrência;
- lembretes e notificações;
- integração Google Calendar, Outlook ou CalDAV;
- persistência de timezone por usuário;
- nova permissão RBAC;
- nova tabela, migration ou endpoint de agenda;
- automações e IA.

A criação, conclusão, cancelamento e demais mutações continuam na seção **Atividades**.

## Arquitetura

### Fonte de dados

A agenda reutiliza:

`GET /activities`

Parâmetros por página:

- `page=N`;
- `limit=100`;
- `ownerUserId=<session.user.id>`;
- `dueFrom=<início local da segunda-feira convertido para ISO>`;
- `dueTo=<fim local do domingo convertido para ISO>`;
- `sortBy=dueAt`;
- `sortOrder=asc`.

Como a API limita cada página a 100 itens, a Web deve buscar páginas adicionais enquanto `page * limit < total`. Assim a agenda semanal não trunca silenciosamente um usuário com mais de 100 atividades no intervalo.

### Intervalo semanal

O cálculo da semana ficará isolado em funções puras, sem dependência de biblioteca externa:

- `startOfWeek(date)` retorna segunda-feira às 00:00:00.000 no timezone local;
- `endOfWeek(date)` retorna domingo às 23:59:59.999 no timezone local;
- `shiftWeek(date, amount)` move a referência em múltiplos de sete dias;
- `weekDays(date)` retorna os sete dias da semana em ordem.

As datas são convertidas para ISO apenas no momento de montar a requisição. O agrupamento visual usa datas locais para evitar que conversão UTC mova uma atividade para a coluna do dia incorreto.

### Web

Novo componente:

`apps/web/src/app/agenda/agenda-view.tsx`

Responsabilidades:

- manter a data de referência da semana;
- carregar todas as páginas do intervalo;
- agrupar atividades por dia;
- renderizar cabeçalho e sete colunas;
- controlar navegação de semana;
- apresentar loading/error/empty state.

Funções de data ficam em:

`apps/web/src/app/agenda/agenda-date-range.ts`

O shell passa a aceitar `agenda` em `CrmSection`. O item de menu aparece somente quando a sessão contém `activity.read`, exatamente como ocorre com Atividades.

`page.tsx` renderiza `AgendaView` com:

- `accessToken={session.accessToken}`;
- `ownerUserId={session.user.id}`.

### Modelo de leitura na Web

A Agenda usa apenas os campos já retornados por `Activity`:

- `id`;
- `type`;
- `status`;
- `priority`;
- `title`;
- `ownerUserId`;
- `dueAt`;
- `companyId`;
- `contactId`;
- `opportunityId` quando presente.

Atividades sem `dueAt` não pertencem a um intervalo de agenda e, portanto, não aparecem nesta visão. Elas continuam disponíveis na seção Atividades.

## UX

### Cabeçalho

O cabeçalho contém:

- título `Agenda comercial`;
- intervalo da semana visível em formato `dd/MM/yyyy — dd/MM/yyyy`;
- botões `Semana anterior`, `Hoje` e `Próxima semana`.

### Grade semanal

Cada coluna apresenta:

- nome abreviado do dia;
- número e mês;
- marcador `Hoje` quando aplicável;
- cartões de atividade ordenados pelo horário.

Cada cartão apresenta no mínimo:

- horário;
- título;
- `Tarefa` ou `Compromisso`;
- prioridade;
- status quando diferente de `PENDING`.

Atividades concluídas e canceladas permanecem visíveis para preservar a leitura histórica da semana, mas recebem tratamento visual distinto.

### Responsividade

Em telas largas a agenda usa sete colunas. Em telas estreitas, a grade deve permitir rolagem horizontal ou reorganização que preserve a legibilidade de cada dia; não será criada uma segunda experiência funcional para mobile nesta microentrega.

## Segurança e isolamento

Nenhuma política nova é necessária:

- o menu Agenda exige `activity.read`;
- a API continua protegida por `AuthenticationGuard` + `PermissionsGuard`;
- `organizationId` continua derivado do principal autenticado;
- a consulta continua executada em `PrismaService.withTenant()`;
- `ownerUserId` limita a agenda ao próprio usuário na UI, mas não substitui o isolamento organizacional da API.

Não é introduzida mutação, portanto não há novo evento de auditoria.

## Tratamento de erros

- falha em qualquer página da consulta invalida o carregamento do intervalo e exibe a mensagem padronizada do `apiRequest`;
- resultado vazio exibe uma mensagem de semana sem atividades;
- ao trocar de semana, respostas de uma carga anterior não devem sobrescrever a semana atual; o efeito deve ignorar resultados após cleanup;
- `dueAt === null` é ignorado defensivamente na projeção da agenda.

## Estratégia de testes

### Testes unitários de datas

`agenda-date-range.test.ts` cobre:

- segunda-feira como início da semana;
- domingo apontando para a segunda-feira anterior;
- mudança entre meses;
- mudança entre anos;
- avanço e retorno de semana;
- geração de sete dias consecutivos.

### Testes de componente

`agenda-view.test.tsx` cobre:

- requisição com `ownerUserId`, `dueFrom`, `dueTo` e ordenação;
- paginação acima de 100 registros;
- agrupamento por dia;
- navegação anterior/próxima;
- botão Hoje;
- destaque do dia atual;
- estados vazio, carregando e erro;
- visualização de concluída/cancelada sem mutação.

### Teste de navegação principal

Teste do `page.tsx`/shell confirma:

- Agenda aparece para usuário com `activity.read`;
- Agenda não aparece sem `activity.read`;
- clicar em Agenda renderiza `AgendaView`;
- as demais seções continuam navegáveis.

### Gate de regressão

A entrega só pode avançar para PR após:

- testes novos GREEN;
- `pnpm verify` GREEN;
- E2E existente GREEN;
- `docker compose config --quiet` GREEN;
- build das imagens API e Web GREEN no workflow do repositório.

## Arquivos previstos

### Criar

- `apps/web/src/app/agenda/agenda-date-range.ts`
- `apps/web/src/app/agenda/agenda-date-range.test.ts`
- `apps/web/src/app/agenda/agenda-view.tsx`
- `apps/web/src/app/agenda/agenda-view.test.tsx`
- `apps/web/src/app/page-agenda-navigation.test.tsx`

### Alterar

- `apps/web/src/app/crm-shell.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css`
- `docs/roadmap.md`
- `CHANGELOG.md`

## Critérios de aceite

A F2.1 está funcionalmente concluída quando:

1. um usuário com `activity.read` consegue abrir Agenda;
2. a semana atual abre por padrão;
3. somente atividades do usuário autenticado e com `dueAt` dentro da semana são carregadas;
4. todos os resultados do intervalo são carregados mesmo quando excedem uma página;
5. as atividades aparecem no dia e horário locais corretos;
6. é possível navegar para semana anterior, próxima e voltar para Hoje;
7. o usuário sem `activity.read` não recebe o item Agenda;
8. nenhuma migration, endpoint ou permissão paralela foi criada;
9. a regressão do CRM permanece GREEN.
