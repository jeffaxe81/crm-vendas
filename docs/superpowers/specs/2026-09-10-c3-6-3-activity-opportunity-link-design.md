# C3.6.3 — Activity -> Opportunity — Design

## Status

Design aprovado em conversa pelo responsável. O plano de implementação TDD foi criado. A execução funcional permanece condicionada ao RED real da Task 1A antes de qualquer código de produção.

## Base

- repositório: `jeffaxe81/crm-vendas`;
- branch: `feat/c3-6-3-activity-opportunity`;
- base: `main` após integração da C3.6.2;
- base SHA: `515a527a4dd710bd8a4b3e2116f1829c509d0561`;
- fase: Cycle 3, sequência C3.6.3;
- dependência concluída: C3.6.2 — Opportunity tenant-aware API.

## Objetivo

Permitir que uma `Activity` seja opcionalmente vinculada a uma `Opportunity`, preservando tenant isolation, integridade referencial, RBAC e auditoria já existentes no módulo de Activities.

A C3.6.3 não introduz Web/Kanban, automações, timeline unificada, expansão de Opportunity na resposta de Activity, múltiplas Opportunities por Activity ou novas permissões.

## Decisão arquitetural

Adicionar `opportunityId` opcional diretamente em `Activity`.

Relação adotada:

- uma `Activity` pode possuir zero ou uma `Opportunity`;
- uma `Opportunity` pode possuir muitas `Activities`.

A alternativa de tabela associativa `ActivityOpportunity` foi rejeitada por antecipar many-to-many sem requisito atual. Armazenar apenas metadata/auditoria foi rejeitado porque perderia integridade referencial e capacidade de consulta eficiente.

## Persistência

### Activity

Adicionar:

- `opportunityId String? @map("opportunity_id") @db.Uuid`;
- relação opcional para `Opportunity`;
- índice por `organizationId + opportunityId`.

### Opportunity

Adicionar relação inversa `activities Activity[]`.

### Integridade tenant-aware

A FK deve impedir, no próprio banco, que uma Activity de um tenant referencie Opportunity de outro tenant.

Para isso, `Opportunity` deve expor uma chave única compatível com a relação composta, usando `id + organizationId`, e `Activity` deve relacionar `opportunityId + organizationId` à Opportunity correspondente.

Não será usada FK simples somente por `opportunityId`.

### Soft delete da Opportunity

Uma Opportunity soft-deleted não pode ser escolhida como nova referência em create/update de Activity.

Um vínculo já existente não será apagado automaticamente quando a Opportunity for soft-deleted posteriormente. A C3.6.3 preserva o histórico da Activity e não cria processo de limpeza em cascata lógica.

## Contratos públicos

O contrato de Activities será estendido em `@axes/contracts`.

### ActivityCreateInputSchema

Adicionar `opportunityId?: UUID`.

### ActivityUpdateInputSchema

Adicionar `opportunityId?: UUID | null`.

Semântica:

- UUID: vincula ou troca a Opportunity;
- `null`: remove o vínculo;
- ausente: preserva o vínculo atual.

### ActivityListQuerySchema

Adicionar filtro opcional `opportunityId?: UUID`.

Nenhum `organizationId` será aceito em body, query ou path como fonte de confiança.

## API

Nenhum endpoint novo é necessário.

A funcionalidade será integrada aos endpoints existentes:

- `POST /api/v1/activities` — pode criar Activity já vinculada a uma Opportunity;
- `PATCH /api/v1/activities/:id` — pode vincular, trocar ou desvincular Opportunity;
- `GET /api/v1/activities` — pode filtrar por `opportunityId`;
- `GET /api/v1/activities/:id` — retorna `opportunityId` junto aos demais campos já persistidos.

Não será criado endpoint separado `/link` ou `/unlink` nesta etapa.

## Validação de referências

Toda validação continua dentro de `PrismaService.withTenant(organizationId, ...)`.

Quando `opportunityId` estiver presente e não for `null`, a Opportunity deve:

1. existir;
2. pertencer ao tenant autenticado;
3. não estar soft-deleted.

Se qualquer condição falhar, retornar `404 ACTIVITY_REFERENCE_NOT_FOUND`.

A API não deve distinguir referência inexistente, excluída ou pertencente a outro tenant.

## Company, Contact e Opportunity

Company, Contact e Opportunity permanecem referências contextuais independentes da Activity.

A C3.6.3 não exige que `companyId` ou `contactId` da Activity coincidam exatamente com o cliente canônico da Opportunity. Uma Opportunity pode pertencer a uma Company enquanto uma Activity específica pode estar relacionada a um Contact daquela empresa. Impor igualdade nesta etapa criaria uma regra de negócio não validada.

## Segurança multiempresa

1. `organizationId` continua vindo exclusivamente do principal autenticado.
2. Toda operação de Activity permanece dentro de `withTenant()`.
3. RLS continua sendo a barreira fail-closed de banco.
4. A FK composta adiciona uma segunda barreira estrutural contra vínculo cross-tenant.
5. O payload público não aceita `organizationId` como fonte de confiança.
6. Uma referência de Opportunity de outro tenant retorna o mesmo 404 genérico de referência.

## RBAC

Nenhuma permissão nova será criada.

- leitura continua exigindo `activity.read`;
- criação/edição continuam exigindo `activity.write`;
- VIEWER pode ler, mas não alterar o vínculo;
- SELLER, MANAGER e ADMIN seguem as permissões já existentes do módulo.

## Auditoria

Não criar eventos dedicados `activity.linked` ou `activity.unlinked` na C3.6.3.

Os eventos atuais continuam sendo usados: `activity.created`, `activity.updated` e eventos de status já existentes.

O snapshot auditável de Activity será ampliado para incluir `opportunityId`, permitindo identificar criação, troca ou remoção do vínculo no `before/after` já existente.

## Consultas

O `ActivitiesService.list()` aceitará `opportunityId` como filtro tenant-aware, mantendo `deletedAt = null`, paginação, ordenação e demais filtros existentes.

A C3.6.3 não inclui `GET /opportunities/:id/activities`. Para o MVP, `GET /activities?opportunityId=...` é suficiente e mantém uma única superfície de consulta.

## Erros

- `400 VALIDATION_ERROR`: UUID/payload/query inválido;
- `404 ACTIVITY_NOT_FOUND`: Activity inexistente, excluída ou fora do tenant;
- `404 ACTIVITY_REFERENCE_NOT_FOUND`: Opportunity ou outra referência indisponível para o tenant;
- `403`: guard existente para ausência de `activity.write` ou `activity.read`.

## Estratégia TDD

A implementação será dividida em microentregas RED -> GREEN:

1. persistência tenant-aware do vínculo;
2. contratos públicos de Activity;
3. create/read/list com `opportunityId`;
4. PATCH para vincular, trocar e desvincular;
5. testes adversariais cross-tenant, soft-delete e RBAC;
6. documentação, changelog, checkpoint e verificação final.

Cada fatia deve provar RED funcional antes de produção e GREEN completo antes de avançar.

## Casos mínimos de teste

1. cria Activity com Opportunity válida do mesmo tenant;
2. Activity sem Opportunity continua válida;
3. leitura retorna `opportunityId`;
4. lista filtra por `opportunityId`;
5. PATCH vincula Opportunity a Activity existente;
6. PATCH troca para outra Opportunity válida do mesmo tenant;
7. PATCH com `opportunityId: null` remove vínculo;
8. create com Opportunity cross-tenant retorna 404 genérico;
9. update com Opportunity cross-tenant retorna 404 genérico;
10. Opportunity soft-deleted é rejeitada como nova referência;
11. vínculo histórico existente não é removido automaticamente após soft delete da Opportunity;
12. banco rejeita relação tenant-cross mesmo em tentativa direta de persistência;
13. VIEWER lê, mas não altera vínculo;
14. SELLER consegue criar/alterar vínculo conforme `activity.write`;
15. auditoria de create/update inclui `opportunityId` no before/after;
16. regressão: lifecycle atual de Activities permanece GREEN.

## Fora do escopo

- Web de oportunidades;
- Kanban e drag-and-drop;
- timeline unificada Opportunity/Activity;
- expansão de dados completos da Opportunity dentro da resposta de Activity;
- endpoint dedicado `GET /opportunities/:id/activities`;
- histórico dedicado de link/unlink;
- many-to-many Activity <-> Opportunity;
- coerência obrigatória entre cliente da Opportunity e Company/Contact da Activity;
- automações, alertas, follow-ups e IA;
- novas permissões RBAC;
- C3.6.4 e C3.6.5.

## Critérios de aceite

1. Activity pode armazenar zero ou uma `opportunityId`.
2. Relação no banco é tenant-aware e fail-closed para cross-tenant.
3. Opportunity soft-deleted não pode ser nova referência.
4. API de Activities suporta create/update/list por `opportunityId` sem endpoint paralelo.
5. `opportunityId: null` desvincula; ausência preserva o vínculo.
6. RBAC existente permanece suficiente.
7. Auditoria existente inclui `opportunityId` nos snapshots.
8. Cross-tenant não revela existência.
9. Testes atuais de Activities e Opportunities permanecem GREEN.
10. `pnpm verify`, E2E, Compose e build das imagens permanecem GREEN no head final.

## Sequência após C3.6.3

1. C3.6.4 — Web de oportunidades e visão de funil;
2. C3.6.5 — E2E, reconciliação documental e checkpoint integral.

## Gate humano

Gate de design concluído e aprovado em conversa. O próximo gate obrigatório é observar o RED funcional real da Task 1A no repositório `jeffaxe81/crm-vendas`; somente depois disso o GREEN 1A pode ser iniciado.
