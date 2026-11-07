# CRM Axesistemas — Cycle 5 checkpoint

**Data:** 07/11/2026  
**Branch:** `feat/c5-knowledge-completion-20261103`  
**PR:** [#334](https://github.com/jeffaxe81/crm-vendas/pull/334)  
**Estado:** implementação em validação; **NÃO HOMOLOGADO**.

## Quatro frentes rastreáveis

1. [#335](https://github.com/jeffaxe81/crm-vendas/issues/335) — API: notas, links, relações, atualização, soft delete, filtros e auditoria.
2. [#336](https://github.com/jeffaxe81/crm-vendas/issues/336) — storage: adapter local, SHA-256, limite 10 MiB, download autenticado e backup.
3. [#337](https://github.com/jeffaxe81/crm-vendas/issues/337) — Web: Hub responsivo, filtros, formulários e download.
4. [#338](https://github.com/jeffaxe81/crm-vendas/issues/338) — qualidade: testes, políticas RLS, revisão e homologação.

## Implementado na branch, ainda sujeito ao gate

- Contratos NOTE / LINK / DOCUMENT; metadata passiva de IA (sem execução de modelos).
- Schema Prisma e migração com organização, vínculos e RLS forçado.
- API autenticada por `knowledge.read` e `knowledge.write`; PRIVATE somente para o autor.
- Storage com chave opaca, hash SHA-256, limite de 10 MiB decodificados, sem caminho derivado do nome do usuário.
- UI com busca paginada, leitura, criação, edição, exclusão e download; internacionalização pt-BR/en/es.
- Testes de contratos, integração API, storage e interface.

## Backup e restauração de documentos — implementação em validação

- Volume persistente: `knowledge-data`, montado em `/var/lib/axes-crm/knowledge`; em produção `KNOWLEDGE_STORAGE_ROOT` é obrigatório.
- A API armazena metadados e SHA-256 no PostgreSQL; o objeto físico é imutável e separado.
- Novo adaptador inclui cada DOCUMENT, inclusive soft-deleted, **com bytes Base64 e hash**, na mesma carga autenticada e criptografada do backup. A validação compara os blobs com os registros do snapshot, detecta adulteração e rejeita bytes faltantes.
- O restaurador prepara objetos com chave opaca antes de remover o grafo SQL. Um arquivo existente só é reutilizado se os bytes coincidirem; nunca há sobrescrita de blob.
- Backups antigos que não contêm todos os blobs continuam recusados para DOCUMENT. Ausência de volume, inconsistência de checksum e quota excedida impedem exportação.
- **Importante:** os arquivos gravados antes de uma falha de transação SQL podem permanecer como órfãos inofensivos. A limpeza/reconciliação e os testes de restauração operacional ainda precisam ser homologados; não declarar atomicidade filesystem+SQL.
- Testes adicionados de exportação, importação, adulteração, colisão e restauração transacional, além do E2E Knowledge Hub. **Não marcar aprovado antes do CI do SHA final.**

## Ainda pendente

- Gate integral em um único commit: formato, lint, types, contratos, Web, shards da API, E2E, build, RLS e Compose.
- E2E real de ponta a ponta para upload, sessão restaurada e download.
- Adaptador completo para snapshot/restore atômico de DOCUMENT, com teste destrutivo isolado.
- Antivírus/varredura externa antes de aceitar arquivos de fontes não confiáveis em produção.
- Homologação do servidor da [#159](https://github.com/jeffaxe81/crm-vendas/issues/159), incluindo HTTPS/CA, login, RLS, backup e rollback operacional.
- Aceite operacional identificado.

**Decisão:** PR de desenvolvimento, sem merge, sem tag de release e sem GO de produção até evidências completas.
