# Checkpoint — C3.6.3 Activity → Opportunity

## Estado da entrega

- branch canônica: `feat/c3-6-3-activity-opportunity`;
- PR: #29;
- base: `main` em `515a527a4dd710bd8a4b3e2116f1829c509d0561`;
- head funcional validado antes da documentação final: `5d659b4fc7f36c64b929828b7c9c0d7516cf8846`;
- workflow funcional integralmente GREEN: `34546559659`;
- PR permanece Draft e o merge permanece bloqueado até aprovação humana explícita específica para o PR #29.

O SHA documental definitivo e o workflow GREEN executado sobre esse SHA são registrados no body do PR #29 após a última alteração documental. Isso evita a autorreferência impossível de gravar, dentro do próprio commit, o SHA que só passa a existir depois que o arquivo é commitado.

## Escopo entregue

A C3.6.3 conecta o domínio canônico de Atividades ao domínio canônico de Oportunidades sem ampliar o escopo para UI ou automações:

- `Activity.opportunityId` é opcional e nullable;
- uma Activity pode apontar para zero ou uma Opportunity;
- uma Opportunity pode ser referenciada por várias Activities;
- `POST /api/v1/activities` aceita `opportunityId` opcional;
- `PATCH /api/v1/activities/:id` aceita UUID para vincular/trocar, `null` para desvincular e ausência do campo para preservar o vínculo atual;
- `GET /api/v1/activities` aceita filtro opcional por `opportunityId`;
- `GET /api/v1/activities/:id` e a listagem retornam o `opportunityId` persistido;
- nenhuma rota dedicada de link/unlink foi criada.

## Persistência e integridade tenant-aware

A persistência foi entregue em duas fatias TDD:

1. coluna nullable `activities.opportunity_id` e índice tenant-aware `(organization_id, opportunity_id)`;
2. FK composta `(opportunity_id, organization_id)` → `opportunities(id, organization_id)`.

A relação composta fornece uma barreira estrutural adicional no PostgreSQL contra vínculo cross-tenant, além da validação da aplicação. O domínio `Opportunity` possui a chave única composta necessária para suportar essa referência.

A Activity continua submetida ao RLS existente com `ENABLE` + `FORCE ROW LEVEL SECURITY`, e as operações de aplicação continuam executadas no contexto de `PrismaService.withTenant()`.

## Regras de referência

- `organizationId` nunca é confiado a body/query/path como fonte de tenant; deriva do principal autenticado;
- Opportunity usada como nova referência precisa pertencer ao mesmo tenant e estar ativa;
- Opportunity inexistente, cross-tenant ou soft-deleted usada como nova referência retorna `404 ACTIVITY_REFERENCE_NOT_FOUND`;
- se uma Opportunity vinculada for soft-deleted posteriormente, a Activity preserva historicamente seu `opportunityId`;
- Company, Contact e Opportunity continuam referências contextuais independentes da Activity;
- não foi criada regra obrigando a Company/Contact da Activity a coincidir com o cliente da Opportunity.

## Contratos públicos

Os contratos compartilhados de Activities foram estendidos sem criar endpoint novo:

- create: `opportunityId?: UUID`;
- update: `opportunityId?: UUID | null`;
- list query: `opportunityId?: UUID`;
- UUID inválido é rejeitado pelo schema compartilhado;
- update sem `opportunityId` preserva o vínculo existente.

## RBAC e auditoria

Nenhuma permissão nova foi criada. A C3.6.3 reutiliza:

- `activity.read` para leitura/listagem;
- `activity.write` para criação e alteração do vínculo.

Os testes adversariais preservam VIEWER como somente leitura e SELLER com escrita autorizada conforme as permissões existentes.

Os eventos de auditoria já existentes de Activity passam a carregar `opportunityId` nos snapshots relevantes. Não foram criados eventos específicos `activity.linked` ou `activity.unlinked`.

## Evidência TDD e CI

### Task 1A — persistência básica same-tenant

- RED: commit `4a2ad181e3bd4281cf260a8c5eaf6d49e932aff1`, workflow `34540388196` — failure no candidato RED antes do suporte persistente;
- implementação da coluna/migration: `a7fbe41b146df3ed48a372fb9e94041d2103b826` e `e79bf89b5d094e9b4c1e4055d95aa19fa3c7a2a0`;
- ajuste de ordenação da migration: `21ea9888aea460796c09eeada141ea43274ec3be`;
- GREEN: workflow `34541419857`.

### Task 1B — FK composta cross-tenant

- RED: commit `7e5826f086823695f3e19b6f9816eeb9ef196b2b`, workflow `34541780135` — failure no candidato RED antes da barreira composta;
- implementação da relação tenant-aware: `092775bccc9edda32f6470f05937f12a740e8a8d`;
- migration da FK composta: `6cf99d7eb87434f7378860479a2102c1d92efccd`;
- GREEN: workflow `34542114684`.

### Task 2 — contratos públicos

- RED: commit `20691fde1fe787278929eb5c1cc12c2fb440c5e9`, workflow `34542471978`;
- implementação: `1187d7fb4ba5daf4cfd752be89c579aee0b1cd3a`;
- GREEN: workflow `34542589464`.

### Task 3 — create/read/list por opportunityId

- RED: commit `98972a9bac916ea3604a162d0819e2e895c13e81`, workflow `34543310845`;
- implementação: `bd8a3f874b09b758938d6814642ee7f876013274`;
- GREEN: workflow `34543521333`.

### Task 4 — PATCH link/swap/unlink/preserve

- RED funcional formatado: commit `e03e4eed5f5e5c67ee49768427f73c224afd2ffe`, workflow `34544154755`;
- implementação: `075db924b2bc00684d69256d953615b2e9b624eb`;
- GREEN: workflow `34544320768`.

### Task 5 — limites adversariais

- cobertura adversarial adicionada em `2300d2b74475a16e84a37f0d0d83513174c8bc8f`;
- workflow `34544753792` falhou somente no `prettier --check`, antes de executar os testes; não é classificado como RED funcional;
- primeira correção de formatação: `6c01cb77632bd4b5120884bc6b886cc31eeff188`;
- workflow `34546165358` ainda falhou somente em Prettier no mesmo arquivo; novamente, não é RED funcional;
- formatação exata final: `5d659b4fc7f36c64b929828b7c9c0d7516cf8846`;
- GREEN integral: workflow `34546559659`.

A Task 5 não fabrica RED artificial: os comportamentos adversariais que já estavam corretos pela implementação das Tasks anteriores permanecem como cobertura de regressão.

## Gate funcional pré-documentação

No head `5d659b4fc7f36c64b929828b7c9c0d7516cf8846`, o workflow `34546559659` terminou GREEN em todas as etapas:

- instalação congelada e políticas de supply chain;
- Prisma generate;
- deploy de todas as migrations;
- provisionamento do role de aplicação sem bypass de RLS;
- `pnpm verify`;
- bootstrap do administrador E2E;
- instalação do Chromium;
- Playwright E2E;
- `docker compose config --quiet`;
- build das imagens API e Web.

## Fora do escopo

Permanecem deliberadamente fora da C3.6.3:

- Web/Kanban de Oportunidades;
- drag-and-drop;
- timeline unificada;
- automações e alertas;
- IA;
- relação many-to-many Activity ↔ Opportunity;
- endpoint dedicado `GET /opportunities/:id/activities`;
- novas permissões RBAC;
- regra obrigatória de coerência entre Company/Contact da Activity e o cliente da Opportunity.

## Gate de integração

A documentação final deve ser seguida por um workflow completo no SHA documental definitivo. Mesmo após GREEN e com o PR mergeável, o PR #29 deve permanecer Draft e **não pode ser marcado ready nem mergeado** sem aprovação humana explícita equivalente a:

`Aprovo o merge do PR #29 na main.`
