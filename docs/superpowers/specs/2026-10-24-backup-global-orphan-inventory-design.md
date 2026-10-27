# Backup Global Orphan Inventory — Design

**Status:** aprovado por continuidade explícita do usuário em 24/10/2026.

## Intent

Fechar a pendência de inventário completo da issue #246 sem introduzir qualquer operação destrutiva. O sistema precisa reconciliar o catálogo inteiro de backups com os objetos físicos do armazenamento, identificar objetos órfãos e inconsistências e medir consumo físico real, preservando RLS e os gates existentes.

## Goals

- enumerar de forma segura os objetos físicos reconhecidos no diretório privado de backups;
- comparar todos os UUIDs físicos com todos os registros de catálogo, atravessando organizações sem desabilitar RLS;
- identificar objetos físicos sem registro de catálogo como `ORPHAN`;
- identificar backups `COMPLETED` sem objeto físico como `MISSING`;
- identificar tamanho físico divergente do catálogo como `SIZE_MISMATCH`;
- identificar objeto UUID existente que não pode ser inspecionado de forma segura como `UNREADABLE`;
- informar consumo físico agregado por organização para objetos referenciados;
- manter temporários e entradas inesperadas visíveis apenas como contadores, sem expor nomes/caminhos;
- expor a auditoria somente a sessão humana com `isSuperuser=true`, com `Cache-Control: no-store`.

## Non-goals

- nenhuma exclusão, reparo, rename ou alteração de catálogo;
- nenhuma aplicação de quota;
- nenhuma reserva de capacidade;
- nenhuma verificação criptográfica ou prova de restaurabilidade;
- nenhuma liberação de restore público;
- nenhuma UI nesta microentrega;
- nenhuma declaração de homologação ou GO operacional.

## Existing constraints

- `BackupStore.objectSize()` já usa `O_NOFOLLOW`, valida arquivo regular e não lê o payload.
- `TenantStorageReconciliationService` é deliberadamente tenant-scoped e paginado; não deve ser convertido em scanner global.
- `backups` usa FORCE RLS; `organizations` não usa RLS.
- `SuperuserGuard` aceita apenas sessão humana com `isSuperuser=true`.
- o inventário não deve usar credencial de deployment nem conexão com `BYPASSRLS`.

## Approaches considered

### A. Ampliar a reconciliação tenant-scoped existente

Rejeitada. Um órfão físico não possui tenant conhecido e a rota atual foi desenhada explicitamente para não enumerar o diretório global. Misturar os dois conceitos tornaria o contrato atual ambíguo.

### B. Nova auditoria global read-only, mantendo RLS — escolhida

Adicionar enumeração segura ao `BackupStore` e um serviço de inventário global. O serviço lista os IDs de organizações e consulta o catálogo de cada uma com `withTenant`; depois compara esse catálogo agregado com o stream de objetos físicos. O endpoint fica sob `AuthenticationGuard + SuperuserGuard`.

Vantagens: preserva RLS, identifica órfãos verdadeiros, mantém o scanner separado da API tenant-scoped e não requer privilégio de banco adicional.

### C. Somente script offline com papel de deployment

Rejeitada para esta entrega. Reduz a superfície HTTP, mas introduz dependência operacional privilegiada e não aproveita o boundary de Superusuário já existente. Pode existir futuramente como ferramenta de suporte, sem ser requisito deste incremento.

## Filesystem contract

`BackupStore.inventoryEntries()` será um `AsyncGenerator` e nunca retornará caminho absoluto.

Entradas reconhecidas:

- `OBJECT`: nome canônico `<uuid>.backup`, inspecionado via `objectSize(id)`;
- `UNREADABLE_OBJECT`: UUID reconhecido, mas inspeção segura falhou ou o objeto desapareceu durante a varredura;
- `TEMPORARY`: arquivo temporário criado pelo próprio `put`; somente contador;
- `UNEXPECTED`: qualquer outra entrada; somente contador e sem nome.

Symlinks com nome `<uuid>.backup` nunca são seguidos; são `UNREADABLE_OBJECT`.

## Catalog contract

O serviço primeiro lê somente `organizations.id`. Para cada organização, executa `prisma.withTenant(organizationId, ...)` e pagina `BackupRecord` sem remover o RLS.

Qualquer objeto físico cujo UUID exista em qualquer estado do catálogo é **referenciado**, portanto não é órfão.

Regras de inconsistência:

- `MISSING`: somente catálogo `COMPLETED` sem objeto físico;
- `SIZE_MISMATCH`: somente `COMPLETED` cujo tamanho físico difere de `byteCount + BACKUP_ENVELOPE_OVERHEAD_BYTES`;
- `UNREADABLE`: objeto UUID não inspecionável de forma segura;
- `ORPHAN`: UUID físico que não existe em nenhuma organização/estado do catálogo.

Estados transitórios (`PENDING`, `RUNNING`, `DELETING`) nunca são classificados como `MISSING`, evitando falso positivo durante concorrência. `DELETED` com objeto físico continua referenciado pelo catálogo e será reportado separadamente como anomalia de estado, sem apagar nada.

## Result contract

`StorageGlobalInventoryResult` contém:

- `configured`, `readOnly: true`, `complete`;
- contadores globais de catálogo, objetos físicos, bytes físicos, órfãos, ausentes, divergentes, ilegíveis, temporários e inesperados;
- `tenants[]` com `organizationId`, contadores e bytes de catálogo/físicos referenciados;
- `findings[]` somente com `backupId`, `organizationId | null`, status e tamanhos quando aplicável;
- nenhuma rota de arquivo, nome inesperado, segredo, checksum ou conteúdo criptografado.

Se o armazenamento não estiver configurado, `configured=false` e `complete=false`; o resultado não implica inspeção aprovada.

## HTTP boundary

Nova rota:

`GET /api/v1/admin/storage/inventory`

Controles:

- `AuthenticationGuard`;
- `SuperuserGuard`;
- sessão de API key rejeitada pelo guard;
- `Cache-Control: no-store`;
- nenhuma query de tenant aceita;
- nenhuma mutação.

## Failure/race semantics

A varredura é uma observação read-only, não um snapshot atômico entre PostgreSQL e filesystem. Um objeto que desapareça entre `readdir` e `objectSize` é reportado como ilegível/instável, nunca reparado automaticamente. O relatório deve declarar essa limitação.

## Security invariants

- nenhum `BYPASSRLS`;
- nenhum uso de `MIGRATION_DATABASE_URL` no runtime do endpoint;
- symlinks não são seguidos;
- caminhos e nomes inesperados não saem da API;
- nenhuma operação de filesystem além de enumeração/open/stat read-only;
- nenhuma alteração no catálogo;
- apenas Superusuário por sessão humana;
- CI/RLS continua obrigatório antes de qualquer merge.
