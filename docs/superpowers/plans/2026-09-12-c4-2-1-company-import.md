# C4.2.1 — Company CSV Import — Implementation Plan

**Goal:** Implementar importação CSV de empresas com Preview → Confirmar, máximo de 500 linhas, autorização `company.write`, isolamento por tenant e auditoria pelo fluxo canônico de empresas.

**Spec:** `docs/superpowers/specs/2026-09-12-c4-2-1-company-import-design.md`

## Restrições globais

- CSV UTF-8/BOM, delimitadores vírgula e ponto e vírgula.
- Cabeçalhos: `legalName`, `tradeName`, `document`, `website`, `notes`.
- `legalName` obrigatório; até 500 linhas de dados não vazias.
- Tenant sempre derivado do principal autenticado.
- Preview não persiste.
- Confirmação repete as validações e cria apenas linhas válidas.
- Sem update/merge, migration, fila, worker ou XLS/XLSX.
- Duplicidade apenas por `document` normalizado no mesmo tenant ou no próprio arquivo.
- Toda criação deve reutilizar `CompaniesService.create()`.

## Task 1 — Contratos e parser CSV

Criar contratos compartilhados de preview/resultado e `CompanyCsvParser`. Primeiro escrever testes cobrindo vírgula, ponto e vírgula, BOM, aspas, quebra de linha dentro de campo, linhas vazias, cabeçalho inválido e limites 500/501. Confirmar RED antes de implementar. Depois implementar parser por máquina de estados e confirmar GREEN.

## Task 2 — Preview tenant-aware

Criar `CompanyImportService.preview()`. Primeiro testar que preview não persiste, usa `CompanyCreateInputSchema`, detecta duplicidade no arquivo e no tenant atual e não vaza dados de outro tenant. Depois adicionar lookup tenant-aware de documentos em `CompaniesService` e implementar preview com SHA-256 do conteúdo normalizado.

## Task 3 — Confirmação

Adicionar `CompanyImportService.confirm()`. Testar primeiro fingerprint divergente, criação parcial, rejeição de linhas inválidas e revalidação no momento da confirmação. Depois implementar criação somente por `CompaniesService.create()`, preservando a auditoria atual.

## Task 4 — API multipart

Criar `CompanyImportController` e `CompanyImportModule`. Testar primeiro as rotas `/api/v1/company-imports/preview` e `/api/v1/company-imports/confirm`, autorização 403 para VIEWER, isolamento multi-tenant, fingerprint inválido e auditoria. Depois implementar com `FileInterceptor`, guards existentes e `company.write`.

## Task 5 — UI de Empresas

Evoluir `companies-view.tsx` com ação Importar CSV, seleção de arquivo, tabela de preview, resumo, confirmação e resultado final. Escrever os testes de UI antes da implementação. Trocar o arquivo deve invalidar preview/fingerprint anterior. O cliente nunca envia tenant.

## Task 6 — Gate final

Atualizar roadmap/backlog para refletir C4.1 concluída e C4.2 em andamento. Executar verificações de formatação, lint, typecheck, testes, build e E2E quando o ambiente suportar. Registrar checkpoint C4.2.1 e abrir Draft PR para `main`. Não realizar merge sem CI verde e aprovação explícita do PR.
