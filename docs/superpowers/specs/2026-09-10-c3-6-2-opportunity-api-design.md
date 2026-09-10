# C3.6.2 — API tenant-aware de Oportunidades — Design

## Status

Design aprovado em conversa. Esta especificação escrita aguarda revisão explícita do responsável antes de qualquer implementação funcional.

## Base e dependência

- repositório: `jeffaxe81/crm-vendas`;
- branch: `feat/c3-6-2-opportunity-api`;
- base empilhada: head validado da C3.6.1, commit `40d20a6b11ca8db973cc3fa817801f759aef19bb`;
- dependência: C3.6.1 — fundação tenant-aware de Oportunidades;
- fase autorizada: Fase 1 — MVP Comercial.

A C3.6.2 não será integrada à `main` antes da C3.6.1. Enquanto o PR da C3.6.1 permanecer sem merge, esta branch permanece empilhada e reversível.

## Objetivo

Expor o domínio canônico `Opportunity` por uma API REST tenant-aware, com CRUD, consulta, movimentação de etapa, RBAC, auditoria, soft delete e concorrência otimista, sem antecipar Web/Kanban, vínculo Activity -> Opportunity ou automações.

## Decisão arquitetural

A API seguirá o padrão modular já estabelecido por Activities, com contratos Zod compartilhados, controller NestJS, service de domínio, `PrismaService.withTenant()` e `AuditService`.

A movimentação no funil será separada da edição geral para preservar a distinção já existente entre `opportunity.write` e `opportunity.move`.

### Alternativas consideradas

1. Um único `PATCH /opportunities/:id` para todos os campos, inclusive etapa. Foi rejeitado porque mistura edição cadastral com movimentação comercial e torna `opportunity.move` redundante.
2. API genérica de comandos. Foi rejeitada por complexidade desnecessária para o MVP.
3. Endpoints REST explícitos, com movimentação dedicada. Esta é a opção adotada por ser coerente com o monólito modular atual e manter contratos claros.

## Endpoints

### `GET /api/v1/opportunities`

Permissão: `opportunity.read`.

Deve listar somente oportunidades não excluídas do tenant autenticado, com paginação e filtros opcionais por:

- busca textual `q` em `title` e `notes`;
- `pipelineId`;
- `stageId`;
- `ownerUserId`;
- `companyId`;
- `contactId`;
- `expectedCloseFrom`;
- `expectedCloseTo`.

A ordenação será limitada a campos explicitamente permitidos pelo contrato, inicialmente `updatedAt`, `createdAt`, `expectedCloseAt` e `estimatedValue`, com `asc` ou `desc`.

### `GET /api/v1/opportunities/:id`

Permissão: `opportunity.read`.

Deve retornar uma oportunidade ativa apenas quando ela existir no tenant atual. Recurso de outro tenant, inexistente ou logicamente excluído retorna `404 OPPORTUNITY_NOT_FOUND`.

### `POST /api/v1/opportunities`

Permissão: `opportunity.write`.

Entrada mínima:

- `pipelineId`;
- `stageId`;
- exatamente um entre `companyId` e `contactId`;
- `ownerUserId`;
- `title`;
- `estimatedValue`;
- `expectedCloseAt` opcional;
- `notes` opcional.

`organizationId`, `createdBy`, `updatedBy`, `version`, timestamps e campos de exclusão nunca são aceitos como fonte de confiança do payload público.

A oportunidade nasce com `version = 1`.

### `PATCH /api/v1/opportunities/:id`

Permissão: `opportunity.write`.

Pode alterar apenas:

- `companyId`/`contactId`;
- `ownerUserId`;
- `title`;
- `estimatedValue`;
- `expectedCloseAt`;
- `notes`;
- `version` como precondição obrigatória de concorrência.

`pipelineId` e `stageId` não são alteráveis neste endpoint.

Para troca de cliente, o service deve calcular o estado final considerando valores existentes + patch e garantir que continue existindo exatamente um cliente. A troca de Company para Contact, por exemplo, exige `companyId: null` e um `contactId` válido no mesmo patch.

### `PATCH /api/v1/opportunities/:id/stage`

Permissão: `opportunity.move`.

Entrada:

- `stageId`;
- `version`.

A etapa de destino deve estar ativa, pertencer ao mesmo tenant e ao mesmo `pipelineId` atual da oportunidade. A C3.6.2 não suporta troca de pipeline.

O estado comercial continua derivado de `PipelineStage.kind` (`OPEN`, `WON`, `LOST`); não será criado status próprio em Opportunity.

### `DELETE /api/v1/opportunities/:id`

Permissão: `opportunity.write`.

Executa soft delete preenchendo `deletedAt`, `deletedBy` e `updatedBy`. Exclusão física não faz parte da API.

A C3.6.2 não exige precondição de `version` no DELETE. Concorrência otimista é obrigatória para PATCH cadastral e movimentação, que são os fluxos de alteração concorrente do MVP. Caso o requisito de delete condicional seja necessário depois, será tratado como evolução de contrato.

## Contratos e representação monetária

Os contratos compartilhados serão publicados em `@axes/contracts`.

`estimatedValue` será representado na API como string decimal canônica, e não como `number` JavaScript, para preservar a precisão de `Decimal(19,2)`.

Formato aceito:

- valor não negativo;
- no máximo 17 dígitos inteiros;
- até 2 casas decimais.

Exemplos válidos: `"0"`, `"1250"`, `"1250.50"`.

O service converte a string para `Prisma.Decimal`; a resposta pública serializa o valor como string decimal.

## Validações de referência

Todas as validações ocorrem dentro de `PrismaService.withTenant(organizationId, ...)`.

### Pipeline e Stage na criação

- Pipeline deve existir, pertencer ao tenant e estar ativo.
- Stage deve existir, estar ativa e pertencer ao Pipeline informado.

### Cliente

- exatamente um entre Company e Contact deve existir no estado final;
- Company/Contact deve pertencer ao tenant;
- cliente logicamente excluído é inválido;
- referência inválida ou cross-tenant retorna `404 OPPORTUNITY_REFERENCE_NOT_FOUND`.

### Owner

O `ownerUserId` deve possuir `OrganizationMembership` ativa no tenant. Usuário sem membership ativa é tratado como referência indisponível e retorna `404 OPPORTUNITY_REFERENCE_NOT_FOUND`.

## Segurança multiempresa

1. `organizationId` vem exclusivamente do principal autenticado.
2. Toda leitura e escrita de Opportunity passa por `withTenant()`.
3. RLS da C3.6.1 continua sendo a barreira de banco fail-closed.
4. A API não diferencia referência inexistente de referência pertencente a outro tenant.
5. Busca por ID cross-tenant retorna `404`, nunca `403` com informação de existência.
6. Nenhum endpoint recebe tenant por query, path ou body.

## Concorrência otimista

`version` é obrigatório em `PATCH /opportunities/:id` e `PATCH /opportunities/:id/stage`.

Fluxo:

1. carregar a oportunidade ativa dentro do tenant;
2. validar referências e regras de domínio;
3. executar atualização atômica condicionada por `id`, `organizationId`, `deletedAt = null` e `version` esperado;
4. incrementar `version` em 1 na mesma operação;
5. se a oportunidade existia na leitura inicial, mas a atualização condicional afetar zero linhas, retornar `409 OPPORTUNITY_VERSION_CONFLICT`.

Esse desenho evita lost update mesmo quando duas requisições leem a mesma versão simultaneamente.

## Auditoria

Registrar fora do payload público e com contexto de requisição:

- `opportunity.created`;
- `opportunity.updated`;
- `opportunity.moved`;
- `opportunity.deleted`.

A auditoria deve incluir `organizationId`, ator, `requestId`, IP quando disponível, `entityType = opportunity`, `entityId`, estado relevante antes/depois e versão.

Para `opportunity.moved`, registrar explicitamente `pipelineId`, `fromStageId`, `toStageId`, `fromVersion` e `toVersion`.

## RBAC

Não criar novas permissões.

- `VIEWER`: leitura por `opportunity.read`;
- `SELLER`: leitura, escrita e movimentação;
- `MANAGER`: leitura, escrita e movimentação;
- `ADMIN`: leitura, escrita e movimentação.

O controller usa os guards existentes e `@RequirePermissions`.

## Estrutura esperada

A implementação, após aprovação desta spec, deverá introduzir apenas o necessário ao domínio:

- `packages/contracts/src/opportunities.ts` e exports/testes correspondentes;
- `apps/api/src/opportunities/opportunities.controller.ts`;
- `apps/api/src/opportunities/opportunities.service.ts`;
- `apps/api/src/opportunities/opportunities.module.ts`;
- testes de integração da API;
- registro do módulo no `AppModule`;
- changelog/checkpoint da microentrega.

Schema/migration só serão alterados se os testes demonstrarem uma necessidade real não coberta pela C3.6.1. Não antecipar alterações de persistência por conveniência.

## Erros de domínio

- `400 VALIDATION_ERROR`: payload/query/UUID inválido;
- `404 OPPORTUNITY_NOT_FOUND`: Opportunity inexistente, excluída ou fora do tenant;
- `404 OPPORTUNITY_REFERENCE_NOT_FOUND`: Pipeline, Stage, cliente ou owner indisponível para o tenant;
- `409 OPPORTUNITY_VERSION_CONFLICT`: versão desatualizada em alteração protegida;
- `403` permanece responsabilidade do guard quando o usuário autenticado não possui a permissão exigida, sem revelar dados de Opportunity.

## Estratégia TDD

A implementação começa por um teste de integração RED exercitando o primeiro lifecycle público de Opportunity. A sequência deve permanecer em microentregas verificáveis:

1. contratos + POST/GET básicos em RED;
2. implementação mínima de create/read/list em GREEN;
3. PATCH cadastral com referência + versionamento em RED/GREEN;
4. movimentação de Stage com `opportunity.move` e conflito de versão em RED/GREEN;
5. soft delete, RBAC, isolamento adversarial e auditoria em RED/GREEN;
6. verificação integral `pnpm verify`, workflow completo e checkpoint.

Não escrever implementação antes do primeiro teste funcional RED da respectiva fatia.

## Casos mínimos de teste

1. cria Opportunity com Company válida;
2. cria Opportunity com Contact válido;
3. rejeita ambos os clientes;
4. rejeita ausência de cliente;
5. rejeita `estimatedValue` inválido/negativo;
6. lista e filtra somente dados do tenant atual;
7. leitura cross-tenant retorna 404;
8. criação/edição com cliente cross-tenant retorna 404;
9. owner sem membership ativa retorna 404;
10. Pipeline ou Stage inativo retorna 404 de referência;
11. Stage de outro Pipeline é rejeitada;
12. PATCH cadastral incrementa `version`;
13. versão stale retorna 409 e não altera dados;
14. move para outra Stage ativa do mesmo Pipeline e incrementa `version`;
15. tentativa de mover para Stage de outro Pipeline é rejeitada;
16. `VIEWER` lê, mas não cria/edita/move/exclui;
17. `SELLER` pode operar conforme permissões existentes;
18. soft delete remove Opportunity das leituras públicas;
19. auditoria registra create/update/move/delete;
20. tenant A não consegue ler ou alterar Opportunity do tenant B.

## Fora do escopo

- Web de oportunidades;
- Kanban/funil visual;
- drag-and-drop;
- Activity -> Opportunity;
- troca de Pipeline de uma Opportunity existente;
- histórico dedicado de movimentações além do AuditLog;
- forecast avançado;
- probabilidade de fechamento;
- multi-moeda;
- produtos/itens;
- propostas/cotações;
- comissões;
- automações, alertas e follow-ups;
- integrações externas;
- IA;
- novas permissões RBAC;
- Fases 2 a 6.

## Critérios de aceite

1. API REST oferece list/read/create/update/move/delete conforme contratos acima.
2. `organizationId` nunca é confiado ao cliente.
3. operações usam `withTenant()` e preservam RLS fail-closed.
4. Company XOR Contact é preservado no estado final de toda criação/edição.
5. Pipeline, Stage, cliente e owner são validados como referências ativas do tenant.
6. movimentação altera apenas Stage dentro do Pipeline atual.
7. `estimatedValue` preserva precisão decimal sem uso de `number` no contrato público.
8. PATCH cadastral e movimentação usam CAS por `version` e retornam 409 em conflito.
9. soft delete remove a entidade das leituras públicas.
10. RBAC usa somente `opportunity.read`, `opportunity.write` e `opportunity.move` já existentes.
11. operações cross-tenant não vazam existência.
12. auditoria registra create/update/move/delete.
13. testes adversariais e lifecycle permanecem GREEN.
14. `pnpm verify`, E2E, Compose e build das imagens permanecem GREEN no head definitivo.
15. nenhuma funcionalidade de Web/Kanban ou Activity -> Opportunity entra na C3.6.2.

## Sequência após C3.6.2

1. `C3.6.3` — vínculo Activity -> Opportunity;
2. `C3.6.4` — Web de oportunidades e visão de funil;
3. `C3.6.5` — E2E, reconciliação documental e checkpoint integral.

## Gate humano

Esta especificação escrita precisa ser revisada e aprovada explicitamente pelo responsável. Somente após essa aprovação deve ser criado o plano de implementação e iniciado o TDD funcional da C3.6.2.
