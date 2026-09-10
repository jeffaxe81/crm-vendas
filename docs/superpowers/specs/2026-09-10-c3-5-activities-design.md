# C3.5 — Atividades, Agenda e Follow-ups — Design

## Objetivo

Evoluir o CRM canônico para suportar atividades comerciais tenant-aware, preservando o comportamento já validado de tarefas e compromissos, mas sem manter dependência da arquitetura legada tRPC/Manus.

## Escopo aprovado

A C3.5 será entregue em microentregas independentes:

1. **C3.5.1 — ACT-001 Fundação de Atividades**: modelo persistente, enums, vínculos básicos e isolamento RLS.
2. **C3.5.2 — API de Atividades**: criar, listar, consultar, editar, concluir/cancelar e inativar com auditoria.
3. **C3.5.3 — Vínculos comerciais**: Company e Contact no domínio atual; Opportunity somente quando existir no modelo canônico da `main`.
4. **C3.5.4 — Web Atividades**: portar a experiência funcional já existente para `apps/web`.
5. **C3.5.5 — Agenda**: visão temporal das atividades sem integração externa neste ciclo.
6. **C3.5.6 — Follow-ups**: identificar pendentes, vencidos e próximos do prazo, sem automação autônoma.
7. **C3.5.7 — Gate integral**: testes adversariais de tenant, auditoria, E2E, Compose/Docker, documentação e aprovação antes de merge.

## C3.5.1 — Modelo de domínio

### Activity

Cada atividade pertence exatamente a uma organização e possui:

- `id`: UUID;
- `organizationId`: UUID obrigatório;
- `type`: `TASK | APPOINTMENT`;
- `status`: `PENDING | COMPLETED | CANCELLED`;
- `priority`: `LOW | MEDIUM | HIGH`;
- `title`: texto obrigatório com até 200 caracteres;
- `description`: texto opcional;
- `companyId`: UUID opcional;
- `contactId`: UUID opcional;
- `ownerUserId`: UUID obrigatório;
- `dueAt`: timestamp opcional;
- `completedAt`: timestamp opcional;
- `cancelledAt`: timestamp opcional;
- `createdAt`, `updatedAt`;
- `createdBy`, `updatedBy`;
- `deletedAt`, `deletedBy` para inativação lógica futura.

### Invariantes

- Nenhum `organizationId` será aceito do cliente como fonte de confiança; o tenant vem da sessão.
- `companyId`, `contactId` e `ownerUserId` devem pertencer à mesma organização quando validados pela API da C3.5.2.
- A C3.5.1 não cria FK para Opportunity porque esse model ainda não existe na `main` canônica.
- `status=PENDING` implica `completedAt=null` e `cancelledAt=null` no fluxo de aplicação; regras de transição entram na C3.5.2.
- Exclusão física não fará parte da API.

## Segurança multiempresa

A tabela `activities` deve usar PostgreSQL RLS com `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.

A policy deve usar `current_setting('app.current_organization_id', true)` e falhar fechada na ausência de contexto, seguindo o padrão já usado por `pipelines` e `pipeline_stages`.

Além do filtro RLS, o modelo deve possuir `organization_id` em todos os índices operacionais necessários para listagem por status, responsável e prazo.

## Relações

- `Organization.activities` → `Activity[]`.
- `User.activitiesOwned` → atividades sob responsabilidade do usuário.
- `User.activitiesCreated` / `activitiesUpdated` / `activitiesDeleted` → rastreabilidade.
- `Company.activities` e `Contact.activities` → vínculos comerciais opcionais.

As relações devem usar `onDelete: Restrict` para preservar histórico comercial.

## Permissões

A C3.5.1 não altera RBAC. As permissões `activity.read` e `activity.write` já existem no mecanismo canônico e serão consumidas pela API na C3.5.2.

## Compatibilidade com o legado

A experiência existente em `client/src/pages/Activities.tsx` serve apenas como referência funcional: tipos tarefa/compromisso, prioridade, prazo, conclusão e preservação histórica. Nenhum endpoint tRPC/Manus será promovido para a arquitetura canônica.

## Fora do escopo da C3.5.1

- endpoints REST;
- interface Web;
- calendário visual;
- integração Google Calendar/Outlook;
- notificações externas;
- automação autônoma de follow-up;
- vínculo com Opportunity antes da existência do domínio canônico correspondente;
- recorrência de atividades.

## Critérios de aceite da C3.5.1

1. Prisma schema contém `Activity`, `ActivityType`, `ActivityStatus` e `ActivityPriority`.
2. Migration cria a tabela e enums correspondentes.
3. Migration habilita e força RLS em `activities`.
4. Policy restringe leitura e escrita ao tenant presente em `app.current_organization_id`.
5. Ausência de contexto não concede acesso a linhas.
6. Estrutura possui índices tenant-aware para status/prazo e owner/status/prazo.
7. `pnpm verify` permanece verde após a implementação.
