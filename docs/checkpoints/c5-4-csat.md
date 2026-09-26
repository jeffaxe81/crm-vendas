# Checkpoint — C5.4 Pesquisa de satisfação (CSAT) do atendimento

Data: 26/09/2026
Branch: `feat/c5-4-csat` (a partir de `phase-3-atendimento`)
Design: `docs/superpowers/specs/2026-09-23-c5-4-csat-design.md`
Status: implementada e validada localmente pelo gate completo.

## Construído

- migration `20260926150000_c5_4_csat`: tabela `ticket_satisfaction_surveys` com `FORCE ROW LEVEL SECURITY`, FK composta por tenant para `tickets`, uma pesquisa por solicitação, `token_hash` (SHA-256 em hex, único), `expires_at`, `rating` 1–5, `comment` até 2000, `responded_at` e `version`; `CHECK`s de nota, comentário, formato do hash e coerência nota/resposta;
- resolução pública do token por **policy de RLS somente leitura** (`ticket_satisfaction_surveys_token_lookup`) ativada por `app.satisfaction_token_hash` na transação: sem `SECURITY DEFINER`, sem `BYPASSRLS` e sem tabela de índice (justificativa no design);
- criação automática na primeira entrada em `RESOLVED`, dentro da transação de `TicketsService.changeStatus` (única alteração: chamada a `createOnResolution` e o campo `satisfactionLink` na resposta que criou a pesquisa); reabrir e resolver de novo não cria outra;
- API: `GET /tickets/:id/satisfaction` (`ticket.read`), `POST /tickets/:id/satisfaction/link { version? }` (`ticket.write`, invalida o token anterior e devolve a URL uma vez), públicos `GET`/`POST /public/satisfaction/:token` (404 genérico, 409 já respondida, 410 expirado), `GET /reports/csat?from&to` (`reports.read`);
- resposta do cliente gera `COMMENT` interno "Avaliação do cliente: N/5" na timeline e auditoria `ticket.satisfaction_responded`; também auditados `ticket.satisfaction_created` e `ticket.satisfaction_link_generated` (`entityType = ticket_satisfaction_survey`);
- contratos em `packages/contracts/src/ticket-satisfaction.ts` (schemas, constantes e `summarizeCsat`);
- web: bloco **Satisfação** no detalhe da solicitação (estado, nota, comentário, **Gerar link** e **Copiar link**, exibindo a URL da resolução uma vez), página pública `/avaliacao/[token]` (sem login, cinco opções e comentário, `noindex` e `no-referrer`) e aba **Satisfação** no Resumo gerencial.

## Evidência de testes (local, banco limpo)

- `prettier --check .`: só acusa `.github/workflows/ci.yml` (CRLF preexistente); `pnpm lint` e `pnpm typecheck` OK;
- API: **51 suítes / 225 testes** (antes 50/218; `ticket-satisfaction.integration` com 7 novos: criação única na resolução, novo link invalida o anterior com `version` e RBAC, indisponível antes da resolução/reaberta/outro tenant, fluxo público completo com timeline e auditoria, token inválido/expirado, isolamento sob a role `axes_app` `NOBYPASSRLS` e relatório por tenant e período);
- contratos: **54** (6 novos); web: **101** (15 novos: painel 4, página pública 6, relatório 4, detalhe 1); `test:repo` 6/6; `pnpm build` OK (rota `ƒ /avaliacao/[token]`).
- E2E não executado (fora do escopo desta tarefa).

## Decisões preservadas

- nenhuma coluna nova em `tickets`/`ticket_events`; o evento de avaliação usa como autor quem resolveu (`author_user_id` é obrigatório desde a C5.1) e marca a origem em `metadata.source = CUSTOMER_SATISFACTION`;
- o período do relatório usa a data de criação da pesquisa (primeira resolução);
- a geração de link só vale para solicitação `RESOLVED`/`CLOSED`; a resposta pública é aceita enquanto o link for válido, independentemente do status atual.

## Fora do escopo

Envio do link por e-mail/WhatsApp (Fase 4), limitação de taxa específica para os endpoints públicos, CSAT por responsável/fila/canal e NPS.

## Pontos de atenção para o merge

- `schema.prisma`: campos novos acrescentados no fim de `Organization` (`ticketSatisfactions`), `User` (`ticketSatisfactionsCreated`/`Updated`) e `Ticket` (`satisfactionSurvey`) e o model novo no fim do arquivo, sem reformatar blocos; o client gerado (`apps/api/src/generated/prisma`) deve ser regenerado após juntar C5.2/C5.3/C5.4;
- `tickets.service.ts`: `changeStatus` passou a desestruturar `{ before, after, satisfaction }` e o construtor recebe `TicketSatisfactionService` (mesmo módulo);
- testes que fazem `TRUNCATE … tickets CASCADE` limpam a tabela nova por cascata; `tickets-view.test.tsx` ganhou o helper `withSatisfaction` para as chamadas do painel.

## Próximo passo

Integrar em `phase-3-atendimento` junto com C5.2/C5.3 e, na Fase 4, disparar o envio do link pelo canal da solicitação.
