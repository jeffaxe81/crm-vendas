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

## Recuperação de dados: regra de segurança

A exportação de **notas e links** utiliza snapshots transacionais do banco, com políticas explícitas de restauração. Já **documentos** possuem bytes em volume separado:

- Volume Compose `knowledge-data` montado em `/var/lib/axes-crm/knowledge`.
- `KNOWLEDGE_STORAGE_ROOT` é obrigatório em produção.
- A exportação de backup de organizações contendo DOCUMENT, inclusive após soft delete, **falha de forma explícita** com `BACKUP_ATTACHMENT_ADAPTER_REQUIRED`.
- A restauração de snapshots que contenham DOCUMENT ou alterem uma organização com documentos existentes também falha antes de excluir registros.
- A mitigação é proposital: um backup só do PostgreSQL **não é um backup íntegro dos documentos**.
- Não desativar esta proteção para passar no CI. É obrigatório implementar e homologar um adaptador que exporte/restaure bytes com integridade, controle de tenant e rollback seguro.

## Ainda pendente

- Gate integral em um único commit: formato, lint, types, contratos, Web, shards da API, E2E, build, RLS e Compose.
- E2E real de ponta a ponta para upload, sessão restaurada e download.
- Adaptador completo para snapshot/restore atômico de DOCUMENT, com teste destrutivo isolado.
- Antivírus/varredura externa antes de aceitar arquivos de fontes não confiáveis em produção.
- Homologação do servidor da [#159](https://github.com/jeffaxe81/crm-vendas/issues/159), incluindo HTTPS/CA, login, RLS, backup e rollback operacional.
- Aceite operacional identificado.

**Decisão:** PR de desenvolvimento, sem merge, sem tag de release e sem GO de produção até evidências completas.
