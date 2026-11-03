# Cycle 5 — Knowledge Hub Completion Design

## Goal

Fechar formalmente o Cycle 5 do roadmap original preservando o Dashboard já existente no `main` e implementando o Hub de Conhecimento do MVP: notas, links, documentos e metadados preparados para futura IA.

## Current state

- DSH-001 — Dashboard simples: já existe no `main`, com API read-only, contratos, UI, isolamento por tenant, smoke/performance/concurrency e políticas de segurança.
- KNW-001 — Notas, links e documentos: ainda não existe modelo Prisma nem módulo API/Web dedicado.
- KNW-002 — Metadados preparados para IA: ainda não existe persistência específica.
- As permissões `knowledge.read` e `knowledge.write` já existem e estão mapeadas aos perfis atuais.
- O App Shell ainda não possui destino de navegação para o Hub.

## Scope

### Knowledge items

Cada item pertence a uma organização e terá um dos tipos:

- `NOTE`: texto livre;
- `LINK`: URL externa `http` ou `https`;
- `DOCUMENT`: arquivo armazenado fora do PostgreSQL por uma interface de storage.

Campos comuns:

- título;
- categoria opcional;
- origem opcional;
- nível de acesso;
- autor/criador;
- versionamento e soft delete;
- datas de criação/atualização.

### Access levels

- `ORGANIZATION`: qualquer usuário da organização com `knowledge.read`;
- `PRIVATE`: somente o autor do item.

As regras de permissão de escrita continuam vindo de `knowledge.write`. O nível `PRIVATE` restringe leitura e download e não é bypassado por outro perfil no MVP.

### Relationships

Um item poderá se relacionar com zero ou mais:

- empresas;
- contatos;
- oportunidades.

Os vínculos serão tabelas explícitas, preservando integridade referencial e permitindo evolução futura sem relação polimórfica fraca.

Toda associação recebida por ID deverá ser revalidada na organização ativa antes de persistir.

### Documents

O banco armazenará somente metadados do documento. Os bytes serão gravados por uma interface `KnowledgeStorage`.

Implementação inicial:

- adapter local em filesystem;
- raiz configurável por `KNOWLEDGE_STORAGE_ROOT`;
- no Docker Compose: `/var/lib/axes-crm/knowledge` em volume nomeado `knowledge-data`;
- limite por documento: 10 MiB;
- nome original limitado a 255 caracteres;
- MIME obrigatório;
- storage key gerada pelo servidor, nunca derivada diretamente do nome do usuário;
- SHA-256 calculado no servidor;
- download sempre com `Content-Disposition: attachment`;
- nenhuma renderização inline de conteúdo enviado pelo usuário.

A API receberá o documento em JSON base64 no MVP para evitar dependências adicionais de upload multipart. O tamanho será validado após decodificação.

### AI-ready metadata

Nenhuma IA será executada no Cycle 5. O item armazenará somente metadados passivos para integração futura:

- `aiStatus`: `UNPROCESSED | READY | FAILED`, default `UNPROCESSED`;
- `aiProcessedAt` opcional;
- `aiProvider` opcional;
- `aiModel` opcional;
- `aiExternalRef` opcional;
- `aiMetadata` JSON opcional.

As rotas de usuário do Cycle 5 não executarão modelos nem aceitarão instruções de prompt. Esses campos existem para futura evolução técnica.

## Data model

Adicionar:

- `KnowledgeItem`;
- `KnowledgeCompany`;
- `KnowledgeContact`;
- `KnowledgeOpportunity`.

Enums:

- `KnowledgeItemType`;
- `KnowledgeAccessLevel`;
- `KnowledgeAiStatus`.

`KnowledgeItem` carregará `organizationId`, `createdBy`, `updatedBy`, `version`, `deletedAt` e `deletedBy`.

O banco terá checks para impedir payload incompatível:

- NOTE exige `noteContent` e não exige URL/documento;
- LINK exige `url`;
- DOCUMENT exige metadados de storage.

## API

Prefixo: `/api/v1/knowledge`.

Rotas MVP:

- `GET /knowledge`: paginação, busca por título/categoria/origem, filtro por tipo;
- `GET /knowledge/:id`;
- `POST /knowledge`;
- `PATCH /knowledge/:id`;
- `DELETE /knowledge/:id` — soft delete;
- `GET /knowledge/:id/document` — download autorizado.

Create/update usam contratos Zod compartilhados.

Para DOCUMENT, create aceita:

```json
{
  "type": "DOCUMENT",
  "title": "Contrato",
  "document": {
    "fileName": "contrato.pdf",
    "mimeType": "application/pdf",
    "base64": "..."
  }
}
```

Para relações, create/update aceitam arrays opcionais `companyIds`, `contactIds` e `opportunityIds`, limitados a 20 IDs únicos por classe.

## Auditing

Registrar ao menos:

- `knowledge.created`;
- `knowledge.updated`;
- `knowledge.deleted`;
- `knowledge.document_downloaded`.

Metadados de auditoria nunca incluem bytes/base64 do documento.

## Web

Adicionar destino `knowledge` ao workspace:

- label: `Hub de conhecimento`;
- grupo: `Conhecimento`;
- permission: `knowledge.read`.

A tela terá:

- lista paginada;
- busca;
- filtro de tipo;
- criação de nota, link e documento;
- edição de metadados/conteúdo permitido;
- download de documento;
- indicação de `ORGANIZATION` ou `PRIVATE`;
- chips de relacionamentos;
- status de IA somente informativo;
- VIEWER sem ações de escrita.

## Security and tenancy

- Todas as queries incluem `organizationId`.
- RLS será adicionada às novas tabelas seguindo o padrão atual.
- Vínculos validam ambos os lados na organização ativa.
- `PRIVATE` não pode ser lido ou baixado por outro usuário da mesma organização.
- IDs de outra organização retornam 404.
- VIEWER recebe 403 em create/update/delete.
- Caminho de storage nunca é construído com nome de arquivo fornecido pelo usuário.
- Documento removido logicamente não fica acessível por download.

## Out of scope

- IA, RAG, embeddings ou banco vetorial;
- OCR;
- compartilhamento público;
- preview inline;
- versionamento de bytes/documentos;
- S3/MinIO/cloud storage;
- indexação full-text avançada;
- webhooks/outbox de knowledge — pertencem ao Cycle 6;
- antivírus externo — ficará como hardening futuro antes de aceitar arquivos não confiáveis em produção aberta.

## Acceptance

1. DSH-001 permanece verde sem regressão.
2. NOTE, LINK e DOCUMENT podem ser criados e listados no tenant ativo.
3. Documento é armazenado fora do PostgreSQL, possui SHA-256 e pode ser baixado somente com autorização.
4. PRIVATE é visível somente ao autor.
5. Relacionamentos com empresa, contato e oportunidade rejeitam IDs cross-tenant.
6. VIEWER é somente leitura.
7. Soft delete remove o item das listagens e bloqueia download.
8. Metadados `ai*` existem e não executam IA.
9. Hub aparece no workspace apenas para usuários com `knowledge.read`.
10. E2E cobre criação de nota, link e documento e persistência após reload.
11. Migrations sobem sobre PostgreSQL vazio; gate completo permanece verde.
12. Checkpoint do Cycle 5 documenta DSH-001 preexistente e KNW-001/002 concluídos.
