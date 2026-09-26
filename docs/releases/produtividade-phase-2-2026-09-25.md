# Release candidata — Produtividade — Fase 2

Data: 25/09/2026
Situação: **candidata a fechamento**. O fechamento oficial depende do quality gate do CI (`Cycle 1 quality gate`, que só roda em PR para `main`) e da aprovação humana do PR `develop → main`, como na Fase 1.

## Identificação

- Marco: `Produtividade — Fase 2`.
- Baseline candidata: `develop` em `387d72139e601f1a535b897a5f00f668bcdd1796` (commit de integração dos relatórios, antes deste documento).
- Stack: monorepositório TypeScript (ADR-0002).

## Escopo entregue

| Bloco           | Microentregas                                                                                                         | Checkpoints                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agenda e resumo | C4.1 Agenda Comercial, C4.1.1 Resumo gerencial                                                                        | `c4-1-agenda-commercial.md`                                                                                                                                |
| Importação      | C4.2.1 empresas, C4.2.2 contatos, C4.2.3 vínculo contato–empresa, C4.3.2 produtos                                     | `c4-2-1-company-import.md`, `c4-2-2-contact-import.md`, `c4-2-3-contact-company-link.md`, `c4-3-2-product-import.md`                                       |
| Produtos        | C4.3 catálogo, C4.3.1 itens da oportunidade com valor calculado, C4.3.3 edição de itens na UI + E2E                   | `c4-3-products-opportunity-items.md`, `c4-3-3-item-editing-e2e.md`                                                                                         |
| Relatórios      | C4.4 vendas por produto, C4.4.1 filtros e exportação CSV, C4.4.2 funil e conversão, C4.4.3 atividades por responsável | `c4-4-sales-by-product-report.md`, `c4-4-1-sales-report-filters-export.md`, `c4-4-2-funnel-conversion-report.md`, `c4-4-3-activity-productivity-report.md` |

Campos personalizados e tags já existiam desde a Fase 1 e completam o escopo previsto no roadmap.

## Evidência local (banco PostgreSQL 16 limpo)

- lint e typecheck: OK;
- API: 49 suítes / 211 testes, verdes em duas execuções seguidas;
- contratos: 44; web: 81; `test:repo`: 6/6;
- `pnpm build`: OK;
- E2E Playwright: 5/5 (as 3 jornadas da Fase 1, autenticação e a jornada de produtos/itens da Fase 2).

## Segurança e qualidade preservadas

- as tabelas novas (`products`, `opportunity_items`) usam `FORCE ROW LEVEL SECURITY` e FKs compostas por tenant;
- os relatórios agregam dentro de `withTenant` e filtram o tenant explicitamente;
- a exportação CSV protege contra injeção de fórmula;
- permissões novas: `product.read` e `product.write`; os relatórios usam `reports.read`;
- as mutações são auditadas e a concorrência é otimista por `version`.

## Pendências para o fechamento oficial

1. `.github/workflows/ci.yml` com quebras de linha CRLF falha no `format:check`; a versão LF precisa ser publicada por alguém com permissão `workflow`;
2. o gate do CI não roda em `develop`; abrir PR `develop → main` para executá-lo;
3. a migration `20260923120000_c4_3_products_opportunity_items` foi escrita à mão (os engines do Prisma são bloqueados no ambiente de desenvolvimento usado) e precisa passar pelo `prisma migrate deploy` do CI;
4. aprovação humana do PR.

## Fora deste fechamento

Fases 3 a 6 (Atendimento, Integrações, Automação e IA assistida) continuam planejadas.
