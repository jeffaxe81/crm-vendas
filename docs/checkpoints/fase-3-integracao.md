# Checkpoint — Integração da Fase 3 — Atendimento (C5.1 a C5.4)

Data: 26/09/2026
Branch: `phase-3-atendimento` (fora da `develop` até o fechamento oficial da Fase 2)

## Entregas integradas

| Entrega                                                     | Checkpoint                   |
| ----------------------------------------------------------- | ---------------------------- |
| C5.1 Solicitações com protocolo, status, timeline           | `c5-1-tickets-foundation.md` |
| C5.2 Filas, atribuição, "assumir" e distribuição automática | `c5-2-queues-assignment.md`  |
| C5.3 SLA por prioridade, estados derivados e relatório      | `c5-3-sla.md`                |
| C5.4 Pesquisa de satisfação com link público e relatório    | `c5-4-csat.md`               |

C5.2, C5.3 e C5.4 foram desenvolvidas em paralelo sobre a C5.1, cada uma com sua migration (`20260926130000`, `20260926140000` e `20260926150000`).

## Resolução da integração

- `schema.prisma`: reconstruído com os três conjuntos de models e relações; client Prisma regenerado;
- `support.manage` criada por C5.2 e C5.3: mantida uma única entrada por perfil (ADMIN, MANAGER);
- `TicketsService`: fila + distribuição (C5.2), prazos de SLA e `sla` nas respostas (C5.3) e criação da pesquisa na resolução (C5.4) coexistem; a resposta de mudança de status devolve `sla` e, na primeira resolução, `satisfactionLink`;
- Resumo gerencial: abas Indicadores, Vendas por produto, Funil, Atividades, SLA e Satisfação;
- testes web: consultas auxiliares (filas e satisfação) passaram a ser respondidas por rota nos testes das telas de Atendimento.

## Evidência (local, banco limpo)

- lint, typecheck e `format:check` (exceto o `ci.yml` com CRLF preexistente);
- API: 55 suítes / 240 testes;
- contratos: 68; web: 114; `test:repo` 6/6;
- build OK (inclui a rota pública `/avaliacao/[token]`); E2E 5/5.

## Pendências

- fechamento oficial da Fase 2 (PR `develop → main`), depois PR `phase-3-atendimento → develop`;
- as 4 migrations da Fase 3 foram escritas à mão e precisam passar pelo `prisma migrate deploy` do CI;
- decisões a validar pelo produto: SLA 24x7 sem pausa em "Aguardando cliente"; evento de avaliação registrado em nome de quem resolveu; sem limite de requisições nos endpoints públicos de satisfação;
- jornada E2E de Atendimento ainda não existe (próxima entrega sugerida).
