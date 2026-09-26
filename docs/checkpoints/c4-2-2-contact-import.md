# Checkpoint — C4.2.2 Importação CSV de Contatos

Data: 23/09/2026
Branch: `feat/c4-2-2-contact-import`
Design: `docs/superpowers/specs/2026-09-23-c4-2-2-contact-import-design.md`
Status: implementada, validada localmente pelo gate completo e integrada à `develop`.

## Construído

- parser CSV genérico `CsvTableParser` (`apps/api/src/csv`), extraído da C4.2.1 sem mudança de comportamento; `CompanyCsvParser` e `ContactCsvParser` são configurações dele;
- endpoints `POST /api/v1/contact-imports/preview` e `/confirm`, protegidos por `contact.write`;
- colunas `fullName` (obrigatória), `jobTitle`, `email`, `phone`, `mobile`, `whatsapp`, `notes`;
- canais criados como principais do respectivo tipo (`EMAIL`, `PHONE`, `MOBILE`, `WHATSAPP`);
- deduplicação por e-mail, sem diferenciar maiúsculas/minúsculas e espaços, no arquivo e contra contatos ativos do tenant;
- `ContactsService.createWithChannels`: contato e canais na mesma transação do tenant, com auditoria `contact.created` e `contact.channel_created`;
- `ContactsService.existingEmails` executado dentro de `withTenant`;
- contratos `ContactImport*` em `@axes/contracts`;
- UI na tela de Contatos (`ContactImportPanel`) com preview, erros por linha, confirmação e resumo; ação visível apenas com `contact.write`.

## Evidência de testes (ambiente local, PostgreSQL 16, banco limpo)

- `pnpm format:check`: OK, exceto `.github/workflows/ci.yml` (quebras de linha CRLF preexistentes, ver abaixo);
- `pnpm lint` e `pnpm typecheck`: OK;
- `pnpm test:repo`: 6/6;
- contratos: 25/25; web: 44/44 (3 novos da C4.2.2);
- API: 39 suítes / 143 testes, incluindo `csv-table-parser.spec` (8), `contact-import.service.spec` (7) e `contact-import.integration.spec` (5);
- `pnpm build`: OK;
- E2E Playwright: 4/4.

Observação: as suítes de caracterização RLS usam IDs fixos e falham se rodarem duas vezes no mesmo banco sem limpeza. No CI o banco é sempre novo. Localmente, recrie o banco antes de repetir a suíte completa.

## Decisões preservadas

- sem vínculo automático com empresas (fica para uma próxima microentrega);
- sem atualização/merge de contatos existentes;
- sem deduplicação por nome ou telefone;
- sem migration nova, fila ou job persistente;
- uma linha inválida não reverte as válidas.

## Pendências fora do código

- `.github/workflows/ci.yml` tem quebras de linha CRLF e falha no `format:check`. A versão corrigida (LF) precisa ser enviada por alguém com permissão `workflow`;
- o `Cycle 1 quality gate` só roda em PRs para `main`, então a `develop` não tem gate automático do monorepo.

## Próximo passo

C4.2.3: vincular contatos importados a empresas existentes (por exemplo, pela coluna `companyDocument`), reutilizando `RelationshipsService.linkCompanyContact`. Depois disso, seguir para Produtos (Fase 2).
