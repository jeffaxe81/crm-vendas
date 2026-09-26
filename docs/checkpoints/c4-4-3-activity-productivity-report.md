# Checkpoint — C4.4.3 Relatório de atividades por responsável

Data: 25/09/2026
Branch: `feat/c4-4-3-activity-productivity-report`
Design: `docs/superpowers/specs/2026-09-23-c4-4-3-activity-productivity-report-design.md`
Status: implementada e validada localmente pelo gate completo; aguardando integração à `develop`.

## Construído

- contrato `packages/contracts/src/activities-by-owner.ts` (exportado no fim do `index`): `ActivitiesByOwnerQuerySchema` (estrito; `from`/`to` ISO com fuso e `from <= to`; `type` `TASK`/`APPOINTMENT`), `ActivitiesByOwnerCountsSchema`, `ActivitiesByOwnerRowSchema` e `ActivitiesByOwnerReportSchema` (`asOf`, `filters`, `items`, `totals`);
- API `GET /api/v1/reports/activities-by-owner` (`reports.read`) com `ActivitiesByOwnerService` (arquivo novo):
  - uma agregação SQL parametrizada (`Prisma.sql`, `COUNT(*) FILTER`) dentro de `prisma.withTenant`, com filtro explícito por tenant somado ao RLS e junção com `organization_memberships` por `organization_id` + `user_id` (só responsáveis com membership; membership desativada aparece com `ownerActive: false`);
  - por responsável: `total`, `completed`, `pending`, `cancelled`, `overdue` (`PENDING` com `dueAt < agora`), `completedOnTime` (`completedAt <= dueAt`), `completionRate` (`completed/total`, `null` se total 0) e `byType`; `totals` com as mesmas métricas;
  - atividades excluídas ignoradas; ordenação por concluídas desc, total desc, nome e id;
  - período inclusivo sobre `dueAt`; com período informado, atividades sem `dueAt` ficam de fora;
  - relógio injetável pelo token `ACTIVITIES_BY_OWNER_CLOCK` (padrão: relógio do servidor);
- `reports.controller.ts` e `reports.module.ts` receberam só acréscimos (import, método/propriedade injetada no fim da classe, providers no fim da lista); `index.ts` dos contratos, bloco de export no fim;
- web: aba **Atividades** no **Resumo gerencial** (`activities-by-owner-view.tsx`), com filtros `De`/`Até`/`Tipo`, validação de período invertido, tabela por responsável com **Total geral**, "(inativo)" para membership desativada e destaque de atrasadas (borda na linha, contagem em vermelho e selo "atrasadas"); estilos novos acrescentados ao fim de `globals.css`.

## Evidência de testes (local, PostgreSQL, banco limpo)

- `prettier --check`: OK exceto `.github/workflows/ci.yml` (CRLF preexistente); `lint`, `typecheck`: OK;
- API: 46 suítes / 195 testes (novos: `activities-by-owner.integration` 6 — relatório vazio; contagens por status, atrasadas com relógio fixo e limite `dueAt = agora`, no prazo com `completedAt = dueAt`, exclusão lógica, responsável sem membership fora e membership desativada sinalizada, avanço do relógio; filtros de período inclusivo com fuso, sem prazo excluídas, tipo e combinados; isolamento entre tenants com usuário membro das duas organizações; RBAC ADMIN/MANAGER 200, SELLER/VIEWER 403, 401, e 400 para `organizationId`, `ownerUserId`, tipo/data inválidos e período invertido; 5xx em falha de banco);
- contratos: 38 (4 novos); web: 71 (6 novos: formatação da taxa, tabela com destaque e totais, filtros aplicar/limpar, período invertido, vazio/erro e navegação pela aba no `ManagementSummaryView`);
- `test:repo` 6/6; `pnpm build` OK.

## Decisões preservadas / fora do escopo

- schema do banco inalterado; nenhuma permissão nova (reutiliza `reports.read`);
- "atrasada" = `PENDING` com `dueAt` estritamente anterior ao agora (mesma regra do resumo gerencial); canceladas nunca são atrasadas;
- campo `cancelled` acrescentado para que `total = completed + pending + cancelled` feche;
- o teste de navegação da nova aba ficou no arquivo novo (renderizando `ManagementSummaryView`) para não mexer em `page-management-summary-navigation.test.tsx`;
- sem filtro por responsável/prioridade, metas, séries temporais, gráficos ou exportação.

## Pontos de atenção para o merge

- `reports.controller.ts`, `reports.module.ts`, `packages/contracts/src/index.ts`, `management-summary-view.tsx` (tipo `ReportTab`, lista `reportTabs` e novo ramo `tab === "activities-by-owner"` logo após o de vendas por produto) e o fim de `globals.css` podem conflitar com outras entregas de relatórios; os conflitos são de acréscimo e se resolvem mantendo os dois lados.

## Próximo passo

Integrar à `develop`; depois, avaliar filtro por responsável na UI, tempo médio de conclusão e exportação CSV.
