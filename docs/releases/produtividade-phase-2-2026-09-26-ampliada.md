# Release candidata — Produtividade — Fase 2 (atualização)

Data: 26/09/2026
Situação: **candidata a fechamento, ampliada**. Esta atualização soma três entregas verificadas nesta sessão à candidata anterior (`docs/releases/produtividade-phase-2-2026-09-25.md`, baseline `bff74f0`). O fechamento oficial continua dependendo do quality gate do CI (só roda em PR para `main`) e da aprovação humana.

## Como chegar a este código

Todo o trabalho está na branch local `integration/phase-2-full`, nunca publicada (a sessão de chat não tem credencial de push). Entregue como bundle: `crm-vendas-phase2-full.bundle`.

Para aplicar:

```bash
git fetch /caminho/para/crm-vendas-phase2-full.bundle integration/phase-2-full:integration/phase-2-full
git checkout integration/phase-2-full
```

A branch parte de `origin/develop` (`bff74f0`) e tem 3 commits em cima.

## Escopo adicionado nesta sessão

| Item                                 | O que é                                                                                                                                | Como foi obtido                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C4.5** — vendas por vendedor       | Relatório por vendedor com filtros de período/funil e exportação CSV                                                                   | **Merge real** da branch `feat/c4-5-sales-reports`, que já existia no GitHub mas nunca tinha sido integrada à `develop`. 6 conflitos resolvidos manualmente (ver decisão abaixo)                             |
| **C4.6** — vendas por período mensal | Relatório com as 12 posições do ano (mesmo sem movimento), filtro de ano/funil, exportação CSV                                         | **Implementado do zero** nesta sessão — não existia código nem branch remota; só existia um relatório de status descrevendo a feature como concluída                                                         |
| **C4.1.6** — Territory Management    | Territórios, atribuição de vendedor, cobertura de empresas-alvo, cotas por período e métricas agregadas — backend e frontend completos | **Implementado do zero** nesta sessão, a partir da especificação de um relatório de status anterior cujo código/branch **não existiam no GitHub** (mesmo padrão do checkpoint de 24–25/09, também fabricado) |

### Decisão de integração relevante (C4.5)

A branch `feat/c4-5-sales-reports` trazia um refactor (`report-filters.tsx`) que unificava a lógica de filtros entre os relatórios de produto e de vendedor. Esse refactor foi **rejeitado** para não arriscar o comportamento já testado de `sales-by-product-view.tsx` (que tem export via servidor, além do CSV client-side). A tela de vendas por vendedor foi reescrita para seguir o mesmo padrão local já usado em `sales-by-product-view.tsx`, mantendo os testes equivalentes.

### Permissões novas

- `territory.read` / `territory.write`: leitura para todos os papéis, escrita para ADMIN, MANAGER e SELLER (VIEWER sem escrita).
- Relatórios (C4.5/C4.6) usam `reports.read`, já existente.

## Evidência coletada nesta sessão (sandbox sem Docker/Postgres)

| Verificação                                                                                   | Resultado                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck `packages/contracts`                                                                | ✅ limpo                                                                                                                                                                                     |
| Typecheck `apps/api`                                                                          | ✅ limpo, exceto 42 erros **exclusivamente** de `Property 'territory...' does not exist on type 'TransactionClient'` — o Prisma Client instalado é anterior ao novo schema (ver pendência 1) |
| Typecheck `apps/web`                                                                          | ✅ limpo                                                                                                                                                                                     |
| Testes `packages/contracts`                                                                   | ✅ 57/57                                                                                                                                                                                     |
| Testes `apps/web` (`vitest run`)                                                              | ✅ 28 arquivos / 96 testes                                                                                                                                                                   |
| Testes unitários `apps/api` (sem DB: `permissions.spec.ts`, `sales-by-owner.service.spec.ts`) | ✅ 8/8                                                                                                                                                                                       |
| Testes de integração `apps/api` (Territory, C4.5, C4.6)                                       | ⚠️ escritos, com typecheck limpo, **não executados** — precisam de Postgres                                                                                                                  |
| `prisma generate` / `migrate`                                                                 | ❌ bloqueado — `binaries.prisma.sh` fora da rede permitida no sandbox                                                                                                                        |
| E2E Playwright / Docker Compose                                                               | ❌ não disponível no sandbox                                                                                                                                                                 |

## Segurança e qualidade preservadas

- Tabelas novas (`territories`, `territory_quotas`, `territory_targets`, `territory_metrics`) usam `FORCE ROW LEVEL SECURITY` e FKs compostas por tenant, no mesmo padrão de `products`/`companies`.
- Mutações auditadas (`territory.created`, `.updated`, `.deleted`, `.reassigned`, `.coverage.added`, `.coverage.removed`, `.quota.set`) e concorrência otimista por `version` nos territórios.
- A migration de Territory foi escrita à mão (mesma limitação já registrada para `20260923120000_c4_3_products_opportunity_items`: os engines do Prisma são bloqueados no ambiente usado) e precisa passar por `prisma migrate deploy` num ambiente com rede completa antes de ir a produção.

## Pendências para o fechamento oficial

1. **Rodar `prisma generate`/`migrate dev`** num ambiente com acesso a `binaries.prisma.sh`, para regenerar o client e então rodar de fato os testes de integração de Territory, C4.5 e C4.6 contra Postgres real.
2. Publicar a branch `integration/phase-2-full` (aplicar o bundle e dar push) e abrir o PR `develop → main` para rodar o quality gate do CI.
3. Decidir se a Territory Management (agora código real e testado, ao contrário da versão original fabricada) permanece nesta mesma release ou é adiada — a decisão anterior foi incluí-la antes do PR, o que este documento já reflete.
4. Aprovação humana do PR.

## Fora deste fechamento

Fases 3 a 6 (Atendimento, Integrações, Automação e IA assistida) continuam planejadas. A Fase 3 (Atendimento: C5.1 Tickets, C5.2 Filas, C5.3 SLA, C5.4 CSAT) já existe na branch `phase-3-atendimento`, mas segue fora do escopo deste fechamento.
