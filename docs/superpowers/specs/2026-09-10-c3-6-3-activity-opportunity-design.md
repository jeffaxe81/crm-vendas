# C3.6.3 — Activity → Opportunity — Design

## Status

Design aprovado em conversa. Esta especificação escrita aguarda revisão explícita do responsável antes de qualquer plano de implementação ou alteração funcional.

## Base

- repositório: `jeffaxe81/crm-vendas`;
- branch: `feat/c3-6-3-activity-opportunity`;
- base: `main` no commit `515a527a4dd710bd8a4b3e2116f1829c509d0561`;
- dependências já integradas: C3.6.1 e C3.6.2;
- fase: Cycle 3 — Fase 1 / MVP Comercial.

## Objetivo

Permitir que uma `Activity` seja opcionalmente associada a uma `Opportunity`, mantendo isolamento multiempresa, integridade referencial, auditoria e RBAC já existentes, sem antecipar Web/Kanban, timeline unificada, automações ou múltiplas oportunidades por atividade.

## Decisão arquitetural

A relação será modelada diretamente em `Activity` por um `opportunityId` opcional.

Cardinalidade do MVP:

- uma `Activity` pode estar vinculada a zero ou uma `Opportunity`;
- uma `Opportunity` pode possuir zero ou muitas `Activities`.

Essa modelagem é suficiente para o fluxo comercial atual e evita uma tabela associativa many-to-many sem necessidade demonstrada.

### Alternativas consideradas

1. **FK opcional em `Activity` — adotada.** Simples, consultável, com integridade referencial e coerente com Company/Contact já presentes em Activity.
2. **Tabela `ActivityOpportunity`.** Permitiria many-to-many, mas adicionaria complexidade de domínio, API e migração sem requisito atual.
3. **Vínculo apenas em metadata/auditoria.** Evitaria migration estrutural, porém perderia integridade referencial e filtros eficientes.

## Persistência

### `Opportunity`

Adicionar chave única composta:

- `@@unique([id, organizationId], map: "opportunities_id_organization_key")`.

Essa chave é necessária para que `Activity` possa usar uma FK composta tenant-aware, evitando que a integridade dependa exclusivamente de validação de aplicação.

### `Activity`

Adicionar:

- `opportunityId String? @map("opportunity_id") @db.Uuid`;
- relação opcional `opportunity` usando `[opportunityId, organizationId]` → `[id, organizationId]`;
- índice `@@index([organizationId, opportunityId], map: "activities_org_opportunity_idx")`.

A FK deve usar `onDelete: Restrict`. Como `Opportunity` usa soft delete, a linha permanece fisicamente existente e vínculos históricos continuam válidos.

### Relação inversa

Adicionar `activities Activity[]` em `Opportunity`.

## Regra de soft delete

Uma Opportunity soft-deleted:

- não pode ser usada como nova referência em criação de Activity;
- não pode ser vinculada/trocada explicitamente em PATCH de Activity;
- não causa remoção automática de vínculos históricos existentes;
- não é revalidada quando um PATCH altera outros campos e omite `opportunityId`.

Isso preserva histórico sem permitir novos vínculos para uma entidade comercial logicamente removida.

## Contratos públicos

Estender `@axes/contracts` em `activities.ts`.

### `ActivityCreateInputSchema`

Adicionar:

- `opportunityId?: UUID`.

### `ActivityUpdateInputSchema`

Adicionar:

- `opportunityId?: UUID | null`.

Semântica:

- omitido: mantém vínculo atual;
- UUID: cria ou troca vínculo;
- `null`: remove vínculo.

### `ActivityListQuerySchema`

Adicionar:

- `opportunityId?: UUID`.

O filtro seleciona Activities ativas do tenant atual vinculadas ao ID informado.

## API

Nenhum endpoint novo será criado.

A alteração utiliza os endpoints existentes:

- `POST /api/v1/activities` — aceita `opportunityId` opcional;
- `PATCH /api/v1/activities/:id` — aceita vínculo, troca ou desvinculação;
- `GET /api/v1/activities?opportunityId=<uuid>` — filtra por Opportunity;
- `GET /api/v1/activities/:id` — passa a retornar `opportunityId` como parte da entidade Activity persistida.

Não haverá endpoint dedicado `link/unlink` nesta etapa, pois o vínculo é um atributo opcional da própria Activity e já cabe no contrato de atualização existente.

## Validação de referência

Quando `opportunityId` for fornecido com UUID não nulo em create/update, o `ActivitiesService` deve validar, dentro de `PrismaService.withTenant()`:

1. Opportunity existe;
2. pertence ao `organizationId` autenticado;
3. possui `deletedAt = null`.

Qualquer falha retorna o erro genérico já existente:

- `404 ACTIVITY_REFERENCE_NOT_FOUND`.

A API não diferencia inexistência, soft delete ou referência cross-tenant.

## Independência de Company, Contact e Opportunity

A C3.6.3 não obriga `companyId` ou `contactId` da Activity a coincidir com o cliente principal da Opportunity.

Motivação:

- uma Opportunity pode pertencer a uma Company;
- uma Activity específica pode estar associada a um Contact daquela relação comercial;
- Company, Contact e Opportunity são referências de contexto diferentes.

Não será adicionada regra de sincronização automática entre esses campos nesta etapa.

## Segurança multiempresa

1. `organizationId` continua vindo exclusivamente do principal autenticado.
2. Toda operação de Activity permanece dentro de `withTenant()`.
3. RLS continua sendo a barreira fail-closed de banco.
4. A nova FK composta adiciona uma segunda barreira estrutural contra vínculo cross-tenant.
5. O payload público não aceita `organizationId` como fonte de confiança.
6. Uma referência de Opportunity de outro tenant retorna o mesmo 404 genérico de referência.

## RBAC

Nenhuma permissão nova será criada.

- leitura/listagem: `activity.read`;
- criação, vínculo, troca e desvinculação: `activity.write`.

Os papéis e guards existentes permanecem inalterados:

- VIEWER: leitura;
- SELLER/MANAGER/ADMIN: leitura e escrita conforme matriz atual.

## Auditoria

Não serão criadas novas ações específicas de link/unlink.

Os eventos existentes passam a incluir `opportunityId` no snapshot auditável:

- `activity.created`;
- `activity.updated`;
- `activity.completed`;
- `activity.cancelled`;
- `activity.deleted`.

Quando o vínculo mudar, o `before` e `after` do `activity.updated` evidenciam a alteração.

## Resposta pública

A C3.6.3 expõe apenas `opportunityId` na Activity.

Não inclui expansão embutida de dados da Opportunity, como título, estágio, valor ou pipeline. Esse enriquecimento fica para a camada Web/consulta futura, evitando acoplamento desnecessário no contrato atual.

## Estratégia de migration

A migration deve:

1. criar a constraint única `(id, organization_id)` em `opportunities`;
2. adicionar `opportunity_id` nullable em `activities`;
3. criar FK composta `(opportunity_id, organization_id)` → `opportunities(id, organization_id)` com `ON DELETE RESTRICT`;
4. criar índice `(organization_id, opportunity_id)`;
5. preservar todas as Activities existentes com `opportunity_id = NULL`.

A migration deve ser retrocompatível com os dados existentes e não executar backfill artificial.

## Estratégia TDD

A implementação será dividida em microentregas RED → GREEN:

1. **Contrato + migration tenant-aware**
   - teste RED prova ausência de `opportunityId`/integridade;
   - migration e Prisma schema mínimos;
   - GREEN de contratos e banco.
2. **Create + read/list**
   - RED para criação com Opportunity válida e filtro por `opportunityId`;
   - implementação mínima no service/contratos;
   - GREEN.
3. **Update link/swap/unlink**
   - RED para vincular, trocar e definir `null`;
   - implementação mínima;
   - GREEN.
4. **Boundaries adversariais**
   - cross-tenant;
   - Opportunity soft-deleted;
   - VIEWER bloqueado;
   - SELLER permitido;
   - FK composta rejeitando vínculo cross-tenant direto no banco;
   - auditoria before/after com `opportunityId`.
5. **Documentação + gate final**
   - checkpoint/changelog;
   - `pnpm verify`;
   - E2E;
   - Compose;
   - build das imagens;
   - merge somente após aprovação humana explícita.

Não será escrita implementação funcional antes do RED correspondente a cada fatia.

## Casos mínimos de teste

1. contrato de criação aceita `opportunityId` UUID opcional;
2. contrato de atualização aceita UUID ou `null`;
3. list query aceita `opportunityId`;
4. cria Activity com Opportunity ativa do mesmo tenant;
5. resposta de create/read contém `opportunityId`;
6. lista filtra por `opportunityId`;
7. PATCH vincula uma Activity sem Opportunity;
8. PATCH troca Opportunity A por B do mesmo tenant;
9. PATCH com `opportunityId: null` desvincula;
10. PATCH que omite `opportunityId` mantém vínculo existente;
11. create com Opportunity cross-tenant retorna 404 genérico;
12. PATCH com Opportunity cross-tenant retorna 404 genérico;
13. Opportunity soft-deleted é rejeitada como nova referência;
14. vínculo histórico permanece se Opportunity for soft-deleted depois;
15. VIEWER pode ler Activity vinculada, mas não alterar vínculo;
16. SELLER pode criar/alterar vínculo conforme `activity.write`;
17. FK composta impede associação cross-tenant mesmo em escrita direta;
18. auditoria inclui `opportunityId` em create/update/delete snapshots;
19. listagem de tenant A nunca retorna Activity do tenant B mesmo com mesmo filtro de Opportunity;
20. suíte existente de Activities e Opportunities permanece GREEN.

## Tratamento de erros

- `400 VALIDATION_ERROR`: UUID/payload/query inválido;
- `404 ACTIVITY_NOT_FOUND`: Activity inexistente, excluída ou fora do tenant;
- `404 ACTIVITY_REFERENCE_NOT_FOUND`: owner, Company, Contact ou Opportunity inválida/indisponível/cross-tenant;
- `403`: responsabilidade do guard de autorização.

Nenhum novo código de erro será criado apenas para Opportunity nesta fase.

## Arquivos esperados

A implementação deverá limitar-se, em princípio, a:

- `apps/api/prisma/schema.prisma`;
- nova migration C3.6.3;
- `packages/contracts/src/activities.ts` e testes de contrato;
- `apps/api/src/activities/activities.service.ts`;
- testes de integração/boundaries de Activities;
- `CHANGELOG.md`;
- checkpoint da C3.6.3.

Controller e module só devem mudar se os testes demonstrarem necessidade real; os endpoints atuais já suportam a extensão do payload/query pelos parsers existentes.

## Fora do escopo

- múltiplas Opportunities por Activity;
- tabela many-to-many;
- expansão de Opportunity na resposta de Activity;
- endpoint dedicado link/unlink;
- sincronização automática Company/Contact ↔ Opportunity;
- timeline unificada;
- histórico dedicado do vínculo além de AuditLog;
- Web de oportunidades;
- Kanban/funil visual;
- drag-and-drop;
- automações, follow-ups e alertas;
- forecast;
- produtos/propostas/comissões;
- integrações externas;
- IA;
- novas permissões RBAC.

## Critérios de aceite

1. Activity pode referenciar zero ou uma Opportunity.
2. Opportunity pode possuir várias Activities.
3. vínculo é protegido por FK composta tenant-aware.
4. create/update validam Opportunity ativa dentro do tenant.
5. cross-tenant e soft-deleted retornam `ACTIVITY_REFERENCE_NOT_FOUND` sem vazamento de existência.
6. PATCH suporta link, swap e unlink por `opportunityId`/`null`.
7. omissão de `opportunityId` preserva vínculo atual.
8. listagem aceita filtro por `opportunityId`.
9. RBAC existente permanece suficiente e inalterado.
10. auditoria existente passa a registrar `opportunityId` nos snapshots.
11. vínculos históricos não são apagados quando Opportunity sofre soft delete posterior.
12. Activities existentes permanecem válidas após migration sem backfill.
13. nenhuma regra artificial força Company/Contact da Activity a coincidir com o cliente da Opportunity.
14. testes adversariais comprovam isolamento de aplicação, RLS e FK composta.
15. suítes anteriores continuam GREEN.
16. `pnpm verify`, E2E, Compose e builds ficam GREEN no head final.
17. nenhum item de C3.6.4 ou posterior entra nesta entrega.

## Sequência posterior

1. `C3.6.4` — Web de Oportunidades e visão de funil;
2. `C3.6.5` — E2E, reconciliação documental e checkpoint integral do bloco C3.6.

## Gate humano

Esta especificação escrita deve ser revisada e aprovada explicitamente pelo responsável. Somente depois dessa revisão será criado o plano detalhado de implementação e iniciado o TDD da C3.6.3.
