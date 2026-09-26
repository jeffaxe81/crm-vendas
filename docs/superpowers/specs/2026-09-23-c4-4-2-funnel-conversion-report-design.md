# C4.4.2 — Relatório de funil e conversão — Design

## Contexto

O bloco **Relatórios** da Fase 2 já tem o resumo gerencial (C4.1.1) e o relatório de vendas por produto (C4.4), ambos no módulo `apps/api/src/reports` com a permissão `reports.read` e exibidos na tela **Resumo gerencial** (abas). A próxima pergunta gerencial é: **como está distribuído o funil e quanto dele converte**. As oportunidades (`opportunities`) pertencem a um funil (`pipelines`) e a uma etapa (`pipeline_stages`, com `position`, `name`, `isActive` e `kind` `OPEN`/`WON`/`LOST`), têm `estimatedValue`, `ownerUserId`, `createdAt` e exclusão lógica.

## Objetivo

1. Mostrar, para um funil escolhido, quantas oportunidades estão hoje em cada etapa ativa e quanto somam (`Σ estimatedValue`).
2. Calcular indicadores de conversão: taxa de ganho, valor ganho, valor perdido, valor em aberto e ticket médio ganho.
3. Permitir recortes por período e responsável.

## Escopo

### API

- `GET /api/v1/reports/funnel`, protegido por `reports.read` (ADMIN e MANAGER; SELLER e VIEWER recebem 403; sem sessão, 401);
- parâmetros (contrato `FunnelQuerySchema`, estrito):
  - `pipelineId` (**obrigatório**, UUID);
  - `from` e `to` (opcionais): data-hora ISO com fuso, limites **inclusivos** (`>=`/`<=`);
  - `ownerUserId` (opcional, UUID);
  - `pipelineId` ausente, UUID ou data inválidos, `from > to` e qualquer outro parâmetro (inclusive `organizationId`) dão 400 `VALIDATION_ERROR`;
- **o período é aplicado a `opportunities.createdAt`**. Decisão: o relatório de funil é uma leitura de coorte — "das oportunidades que entraram no funil no período, onde estão hoje e quantas foram ganhas/perdidas". A previsão de fechamento (`expectedCloseAt`, usada em vendas por produto) é opcional e é editada ao longo da negociação, o que deixaria oportunidades sem data fora do funil e faria a coorte mudar a cada edição; `createdAt` é obrigatório e imutável. Não existe data de ganho/perda no schema atual, por isso a taxa não é "fechadas no período";
- funil de outro tenant ou inexistente → 404 `PIPELINE_NOT_FOUND` (sem revelar existência). Funil **inativo** do próprio tenant continua consultável (histórico);
- base do cálculo: oportunidades **não excluídas** do funil, na etapa em que estão agora;
- resposta (`FunnelReportSchema`):
  - `asOf`, `filters` normalizados (datas em UTC ou `null`) e `pipeline` (`id`, `name`, `isActive`);
  - `stages`: **todas as etapas ativas** do funil em ordem de `position` (inclusive as sem oportunidades, com zero), cada uma com `stageId`, `name`, `kind`, `position`, `opportunities` (inteiro) e `value`;
  - `inactiveStages`: `{ opportunities, value }` das oportunidades paradas em etapas desativadas — ficam fora das linhas, mas entram em `totals` e nos indicadores, para os números fecharem com o total do funil;
  - `totals`: `{ opportunities, value }` de todas as oportunidades do recorte (= Σ `stages` + `inactiveStages`);
  - `indicators`: `openOpportunities`, `wonOpportunities`, `lostOpportunities`, `openValue`, `wonValue`, `lostValue` (pela situação `kind` da etapa), `winRate` e `averageWonTicket`;
- contrato numérico:
  - valores monetários: string com exatamente 2 casas (`"1500.25"`);
  - `winRate`: **string percentual de 0 a 100 com exatamente 2 casas** (`"66.67"`), = ganhas / (ganhas + perdidas) × 100, arredondamento meio para cima; `null` quando não há oportunidades ganhas nem perdidas;
  - `averageWonTicket`: valor ganho / quantidade ganha, 2 casas, arredondamento meio para cima; `null` quando não há ganhas;
  - quantidades: inteiros.

### Implementação

- `FunnelService` (`apps/api/src/reports/funnel.service.ts`), dentro de `prisma.withTenant` em transação `RepeatableRead`: busca o funil (`organizationId` + `id`), as etapas ativas ordenadas, e executa uma agregação SQL parametrizada (`$queryRaw` com `Prisma.sql`) por etapa (`COUNT(*)`, `SUM(estimated_value)`), com junção composta por `organization_id` e `pipeline_id`, filtro explícito por tenant além do RLS;
- somas no PostgreSQL em `numeric`, devolvidas como texto; composição de totais, indicadores e arredondamentos em `bigint` (centavos/pontos-base), sem ponto flutuante;
- resposta validada com `FunnelReportSchema` antes de sair; erro de banco vira 5xx;
- no controller e no módulo, apenas acréscimos no fim (rota `funnel`, provider `FunnelService`).

### Contratos

`packages/contracts/src/funnel.ts`: `FunnelQuerySchema`, `FunnelReportSchema`, `FunnelStageRowSchema`, `FunnelBucketSchema`, `FunnelIndicatorsSchema`, `FunnelPercentSchema`, `FunnelStageKindSchema` e tipos, exportados no `index`.

### Web

- nova aba **Funil** no Resumo gerencial (`funnel-view.tsx`), só consulta a API quando aberta;
- seletor de funil carregado de `GET /pipelines` (mesmo endpoint da tela de oportunidades; o primeiro funil fica selecionado);
- filtro de período `De`/`Até` (fuso local → início/fim do dia em ISO, reaproveitando `periodBoundary`), Aplicar/Limpar e validação de período invertido;
- cartões de indicadores (taxa de ganho, valor ganho, perdido, em aberto, ticket médio; `null` aparece como "—");
- tabela por etapa (etapa, tipo, oportunidades, valor estimado, barra proporcional em CSS à maior quantidade) com linha **Total** e aviso quando há oportunidades em etapas desativadas.

## Fora do escopo

Conversão entre etapas (exige histórico de movimentação, inexistente no schema), tempo médio por etapa, data de ganho/perda, seletor de responsável na UI (a API já aceita), exportação e gráficos além da barra simples.

## Segurança e integridade

- consulta sempre dentro de `withTenant`, RLS `FORCE` e filtro explícito por organização;
- funil de outro tenant dá 404; `ownerUserId` de outro tenant retorna zeros;
- nenhum schema de banco alterado; nenhuma permissão nova.

## Critérios de aceite

1. ADMIN e MANAGER recebem o mesmo relatório; SELLER e VIEWER recebem 403; sem sessão, 401.
2. As etapas ativas aparecem em ordem de `position`, com quantidade e soma de `estimatedValue` das oportunidades não excluídas que estão nelas; etapas desativadas ficam fora das linhas e entram em `inactiveStages`/totais.
3. Taxa de ganho, valores por situação e ticket médio corretos, com arredondamento meio para cima; divisões por zero dão `null`.
4. `from`/`to` (sobre `createdAt`, inclusivos) e `ownerUserId` restringem o resultado e podem ser combinados.
5. Funil de outro tenant ou inexistente → 404; dados de outro tenant nunca aparecem; somas grandes exatas.
6. Parâmetros inválidos, desconhecidos ou `pipelineId` ausente → 400.
7. Na web, a aba **Funil** permite escolher o funil e o período e mostra a tabela com barras e os indicadores.
