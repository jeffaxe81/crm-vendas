# C3.5.2 — API de Atividades

## Contexto

A C3.5.1 integrou à `main` a fundação persistente tenant-aware de `Activity`. A C3.5.2 expõe esse domínio pela API REST canônica, preservando os contratos de autenticação, autorização, RLS e auditoria já usados no CRM.

## Escopo aprovado

A API de atividades deve permitir:

- criar atividade;
- listar atividades com paginação e filtros comerciais básicos;
- consultar uma atividade por id;
- editar atividade;
- alterar estado entre `PENDING`, `COMPLETED` e `CANCELLED`, com timestamps controlados pelo servidor;
- inativar via soft delete;
- vincular opcionalmente empresa e contato da mesma organização;
- atribuir responsável com membership ativa na mesma organização;
- aplicar `activity.read` e `activity.write`;
- manter isolamento tenant-aware e fail-closed;
- registrar auditoria de criação, atualização, conclusão/cancelamento e exclusão lógica.

## Fora de escopo

- interface Web;
- agenda/calendário;
- recorrência;
- notificações e automação de follow-up;
- integração Google/Outlook;
- vínculo com Opportunity enquanto o domínio canônico correspondente não estiver integrado à `main`;
- hard delete.

## Contrato REST

### `GET /api/v1/activities`

Permissão: `activity.read`.

Filtros previstos: `q`, `type`, `status`, `priority`, `ownerUserId`, `companyId`, `contactId`, `dueFrom`, `dueTo`, além de paginação. Itens soft-deleted não aparecem.

### `GET /api/v1/activities/:id`

Permissão: `activity.read`. Retorna 404 para id inexistente, soft-deleted ou pertencente a outra organização.

### `POST /api/v1/activities`

Permissão: `activity.write`.

Entrada mínima: `type`, `title`, `ownerUserId`. Aceita `description`, `priority`, `companyId`, `contactId` e `dueAt`. `status` não é fornecido na criação; inicia em `PENDING`.

### `PATCH /api/v1/activities/:id`

Permissão: `activity.write`.

Permite editar conteúdo, vínculos, responsável, prazo e `status`. `completedAt` e `cancelledAt` são sempre definidos pelo servidor conforme a transição de estado.

### `DELETE /api/v1/activities/:id`

Permissão: `activity.write`. Executa soft delete com `deletedAt/deletedBy`.

## Regras de domínio

1. Toda consulta e mutação ocorre dentro de `PrismaService.withTenant`.
2. Referências de empresa/contato precisam existir, não estar excluídas e pertencer à organização ativa.
3. O responsável precisa possuir membership ativa na organização ativa.
4. Transição para `COMPLETED` define `completedAt` e limpa `cancelledAt`.
5. Transição para `CANCELLED` define `cancelledAt` e limpa `completedAt`.
6. Retorno para `PENDING` limpa ambos os timestamps.
7. Soft-deleted não pode ser lido nem alterado pela API.
8. A tentativa de acessar/mutar recurso de outro tenant se comporta como `404`, sem revelar existência.
9. VIEWER mantém leitura e recebe `403` em mutações.

## Auditoria

A API registra `activity.created`, `activity.updated`, `activity.completed`, `activity.cancelled` e `activity.deleted`, com `organizationId`, ator, request id, entidade e snapshots seguros de before/after.

## Estratégia TDD

O primeiro commit da microentrega contém apenas contratos e testes de integração RED. A implementação de contracts/controller/service/module/AppModule somente entra após falha funcional observável causada pela ausência das rotas de atividades.
