# C3.6.1 — Fundação tenant-aware de Oportunidades — Design

## Status

Aprovado conceitualmente para especificação. Implementação permanece bloqueada até revisão desta spec pelo responsável.

## Base

- repositório: `jeffaxe81/crm-vendas`;
- branch: `feat/c3-6-1-opportunity-foundation`;
- base: `main` no commit `ec28da9780cf51068c95c81e47a088586601e4b3`;
- fase autorizada: Fase 1 — MVP Comercial.

## Objetivo

Criar a fundação persistente e tenant-aware do domínio `Opportunity`, conectando o cliente comercial ao funil já existente sem antecipar API, Web ou automações.

A C3.6.1 deve preencher a lacuna arquitetural entre o domínio de Pipeline já existente e os requisitos do MVP que exigem cadastro e movimentação de oportunidades no funil.

## Decisão de modelagem do cliente

Uma oportunidade deve pertencer a exatamente um cliente comercial, representado nesta etapa por uma das duas entidades canônicas existentes:

- `Company`; ou
- `Contact`.

A modelagem usará duas FKs explícitas, `company_id` e `contact_id`, combinadas com uma restrição XOR no banco para garantir que exatamente uma delas esteja preenchida.

### Motivos

- preserva integridade referencial real;
- permite oportunidade para empresa ou pessoa/contato independente;
- evita criar agora uma abstração genérica `Client`/`Party` que obrigaria reestruturação do CRM;
- mantém o padrão atual de relações explícitas do monólito modular;
- deixa aberta uma evolução futura para entidade agregadora somente se existir necessidade comprovada.

## Alternativas rejeitadas nesta etapa

### Somente Company

Mais simples, porém impediria oportunidades ligadas a contatos independentes e reduziria a aderência ao modelo comercial atual.

### Entidade genérica Client/Party

Arquiteturalmente flexível, mas introduziria migração ampla de Company, Contact, Activity, histórico e interfaces antes de existir necessidade operacional para esse custo.

## Modelo Opportunity

A entidade deve conter, no mínimo:

- `id`: UUID;
- `organizationId`: UUID obrigatório;
- `pipelineId`: UUID obrigatório;
- `stageId`: UUID obrigatório;
- `companyId`: UUID opcional;
- `contactId`: UUID opcional;
- `ownerUserId`: UUID obrigatório;
- `title`: texto obrigatório com até 200 caracteres;
- `estimatedValue`: `Decimal(19,2)` não negativo;
- `expectedCloseAt`: timestamp opcional;
- `notes`: texto opcional;
- `createdAt`, `updatedAt`;
- `createdBy`, `updatedBy`;
- `version`: inteiro para concorrência otimista;
- `deletedAt`, `deletedBy` para inativação lógica.

A C3.6.1 não introduz multi-moeda. `estimatedValue` representa o valor comercial na moeda operacional adotada pela organização; suporte explícito a `currencyCode` fica para evolução própria caso o requisito seja aprovado futuramente.

Não será criado enum de status próprio na C3.6.1. O estado comercial será derivado da classificação da etapa do pipeline (`OPEN`, `WON`, `LOST`) para evitar duas fontes de verdade.

## Invariantes

1. `organizationId` nunca é aceito do cliente como fonte de confiança; o tenant é resolvido pela sessão e pelo contexto transacional da aplicação.
2. Exatamente um entre `companyId` e `contactId` deve ser não nulo.
3. Cliente, pipeline, etapa e owner devem pertencer à mesma organização da oportunidade.
4. `stageId` deve pertencer ao `pipelineId` informado.
5. O cliente vinculado deve estar ativo no momento da criação ou alteração do vínculo. Essa regra será aplicada pelo service da C3.6.2; a C3.6.1 apenas cria integridade referencial e isolamento necessários para suportá-la.
6. `estimatedValue` deve ser maior ou igual a zero.
7. Exclusão física não fará parte do domínio público; a fundação prepara soft delete.
8. Mudança de etapa futura deve preservar trilha de auditoria; a C3.6.1 apenas cria os campos necessários.
9. `version` inicia em `1` e será utilizado pela API futura para concorrência otimista.
10. Nenhuma regra futura de automação, comissão, forecast avançado ou probabilidade será embutida nesta fundação.

## Relações

### Organization

Adicionar `Organization.opportunities -> Opportunity[]`.

### Pipeline

Adicionar `Pipeline.opportunities -> Opportunity[]`.

### PipelineStage

Adicionar `PipelineStage.opportunities -> Opportunity[]`.

### Company

Adicionar `Company.opportunities -> Opportunity[]`.

### Contact

Adicionar `Contact.opportunities -> Opportunity[]`.

### User

Adicionar relações explícitas:

- `opportunitiesOwned`;
- `opportunitiesCreated`;
- `opportunitiesUpdated`;
- `opportunitiesDeleted`.

As relações comerciais devem usar `onDelete: Restrict` para impedir perda acidental de histórico.

## Integridade tenant-aware das FKs

RLS é a barreira principal de isolamento em runtime, mas a migration também deve impedir que uma linha válida de uma organização referencie entidade de outra organização.

Sempre que uma relação precisar validar o tenant no próprio banco, a FK de `opportunities` deve incluir `organization_id` junto ao identificador da entidade pai.

Se Company, Contact, User, Pipeline ou PipelineStage ainda não expuserem uma chave candidata compatível com `(organization_id, id)` ou combinação equivalente, a migration poderá adicionar apenas a constraint/índice único mínimo necessário para suportar a FK composta, sem mudar o comportamento funcional desses domínios.

Não criar constraints duplicadas quando a estrutura atual já fornecer garantia equivalente.

## Integridade pipeline-stage

Uma FK simples em `stage_id` garante existência da etapa, mas não garante sozinha que ela pertence ao `pipeline_id` da mesma oportunidade.

A migration deve garantir essa consistência no banco por chave composta tenant-aware:

- `pipeline_stages` deve expor uma chave/constraint adequada que identifique `(organization_id, pipeline_id, id)`;
- `opportunities` deve referenciar essa combinação, garantindo que organização, pipeline e etapa sejam coerentes;
- a aplicação futura repetirá a validação para produzir erro de domínio legível, mas a integridade final fica protegida também no banco.

Se a estrutura atual de `pipeline_stages` já oferecer constraint equivalente, ela deve ser reutilizada em vez de duplicada.

## Segurança multiempresa

A tabela `opportunities` deve usar PostgreSQL Row-Level Security com:

- `ENABLE ROW LEVEL SECURITY`;
- `FORCE ROW LEVEL SECURITY`;
- policy baseada em `current_setting('app.current_organization_id', true)`;
- comportamento fail-closed quando o contexto de organização estiver ausente ou inválido.

A policy deve proteger `SELECT`, `INSERT`, `UPDATE` e `DELETE` no nível da linha, seguindo o padrão já adotado por `pipelines`, `pipeline_stages` e `activities`.

## Constraints de banco

A migration deve incluir, no mínimo:

- check XOR entre `company_id` e `contact_id`;
- check `estimated_value >= 0`;
- FKs tenant-aware sempre que necessárias para impedir vínculo cross-tenant mesmo fora do fluxo normal da aplicação;
- consistência composta entre organização, pipeline e etapa;
- `onDelete: Restrict` para referências de domínio;
- defaults de timestamps/version compatíveis com o padrão do projeto.

## Índices

Criar índices tenant-aware orientados aos fluxos previstos:

- `(organization_id, deleted_at, stage_id, expected_close_at)` para funil e previsão;
- `(organization_id, owner_user_id, deleted_at, expected_close_at)` para carteira do vendedor;
- `(organization_id, company_id, deleted_at)` para histórico por empresa;
- `(organization_id, contact_id, deleted_at)` para histórico por contato;
- `(organization_id, pipeline_id, stage_id, deleted_at)` para visão de funil.

Índices redundantes com constraints existentes devem ser evitados.

## RBAC

A C3.6.1 não altera o mapa de permissões. As permissões canônicas já existentes serão consumidas nas próximas microentregas:

- `opportunity.read`;
- `opportunity.write`;
- `opportunity.move`.

Nenhuma autorização é implementada nesta etapa porque ainda não existem endpoints de oportunidade.

## Auditoria

A C3.6.1 não cria chamadas de auditoria de aplicação, pois não expõe operações de negócio. O modelo deve, porém, possuir todos os campos necessários para rastreabilidade e permitir que a C3.6.2 registre posteriormente:

- `opportunity.created`;
- `opportunity.updated`;
- `opportunity.moved`;
- `opportunity.deleted`.

## Compatibilidade com Activity

A C3.6.1 não altera `Activity` e não adiciona ainda `opportunityId` ao modelo de atividades.

Esse vínculo será tratado separadamente na C3.6.3 para evitar misturar a fundação de Opportunity com alteração de um domínio já estabilizado.

## Fora do escopo

- controllers/endpoints REST;
- services de CRUD;
- Web de oportunidades;
- Kanban/funil visual;
- drag-and-drop;
- vínculo `Activity -> Opportunity`;
- recorrência ou agenda;
- probabilidade de fechamento;
- forecast avançado;
- multi-moeda;
- produtos e itens da oportunidade;
- propostas/cotações;
- comissões;
- automações e alertas;
- IA;
- integrações externas;
- entidade genérica `Client`/`Party`;
- Fases 2 a 6 do roadmap.

## Critérios de aceite

1. Prisma schema contém `Opportunity` e suas relações explícitas.
2. Migration cria `opportunities` de forma reproduzível em PostgreSQL vazio.
3. A migration garante exatamente um cliente entre Company e Contact.
4. A migration rejeita `estimated_value < 0` e usa precisão `Decimal(19,2)`.
5. Pipeline e etapa não podem divergir dentro da oportunidade.
6. Relações cross-tenant de Company, Contact, owner, Pipeline e PipelineStage são bloqueadas por constraints e/ou RLS apropriadas.
7. `opportunities` usa `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
8. Ausência de `app.current_organization_id` não concede acesso a linhas.
9. Organização A não consegue ler, inserir, alterar ou inativar oportunidade da organização B em testes adversariais.
10. Índices tenant-aware cobrem estágio/previsão, owner/previsão e cliente.
11. Nenhum endpoint ou componente Web de oportunidade é criado na C3.6.1.
12. `pnpm verify` permanece GREEN no head da microentrega.

## Sequência após C3.6.1

A ordem proposta para o domínio de Oportunidades é:

1. `C3.6.1` — fundação tenant-aware;
2. `C3.6.2` — API CRUD, consulta e movimentação de etapa com auditoria;
3. `C3.6.3` — vínculo Activity -> Opportunity;
4. `C3.6.4` — Web de oportunidades e visão de funil;
5. `C3.6.5` — E2E, reconciliação documental e checkpoint integral.

## Gate humano

Esta spec define o contrato arquitetural da C3.6.1. Nenhuma implementação deve começar antes da revisão e aprovação explícita deste documento pelo responsável.