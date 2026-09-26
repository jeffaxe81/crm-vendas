# C5.4 — Pesquisa de satisfação (CSAT) do atendimento — Design

## Contexto

A C5.1 entregou as solicitações (`tickets`) com máquina de estados, timeline (`ticket_events`) e auditoria. O roadmap da Fase 3 (`2026-09-26-fase-3-atendimento-design.md`) prevê a **pesquisa de satisfação disparada ao resolver**. Esta entrega cria a pesquisa, o link público que o cliente usa para responder sem login, o bloco de acompanhamento no detalhe da solicitação e o relatório de CSAT no Resumo gerencial. O **envio** do link por e-mail/WhatsApp é da Fase 4 (Integrações): aqui a equipe copia a URL e envia pelo canal que já usa.

## Objetivo

1. Criar automaticamente uma pesquisa por solicitação na **primeira** entrada em `RESOLVED`.
2. Permitir que o cliente avalie (nota 1–5 e comentário) por um link público, uma única vez, sem vazar dados de outros tenants.
3. Mostrar à equipe o estado da pesquisa e ao gestor o CSAT do período.

## Modelo

Migration `20260926150000_c5_4_csat`, tabela `ticket_satisfaction_surveys` (tenant, `FORCE ROW LEVEL SECURITY`):

- `id`, `organization_id`, `ticket_id` (FK composta `(ticket_id, organization_id) → tickets`), **única por solicitação** (`ticket_satisfaction_surveys_ticket_org_key`);
- `token_hash` `VARCHAR(64)`: SHA-256 em hex do token; **único global** e com `CHECK` de formato. O token em claro (32 bytes aleatórios de `crypto.randomBytes`, em base64url, 43 caracteres) nunca é gravado;
- `expires_at`: criação/geração + 7 dias (`TICKET_SATISFACTION_TTL_DAYS`);
- `rating` (`SMALLINT`, `CHECK 1..5`), `comment` (`CHECK` até 2000 caracteres), `responded_at`; `CHECK ((rating IS NULL) = (responded_at IS NULL))`;
- `created_by`/`updated_by` (usuários), `created_at`, `updated_at`, `version` (trava otimista da geração de link).

Nenhuma coluna nova em `tickets` nem em `ticket_events`. No `schema.prisma` os campos de relação foram acrescentados no fim de `Organization`, `User` e `Ticket`, sem reformatar os blocos existentes.

## Resolução pública do token (ponto sensível)

O endpoint público não tem sessão, portanto não há `app.current_organization_id`. Opções avaliadas:

| Opção                                  | Avaliação                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Função `SECURITY DEFINER` hash → ids   | Com `FORCE ROW LEVEL SECURITY`, o **dono** da tabela também é filtrado; a função só funcionaria se o dono tivesse `BYPASSRLS`/superusuário. Localmente e no CI o dono (`axes`) é superusuário, mas isso não é garantido em produção: o comportamento dependeria do provisionamento, e um dono sem bypass quebraria a função silenciosamente (0 linhas). |
| Tabela de índice sem RLS (hash, ids)   | Funciona, mas a role de aplicação recebe `SELECT` em todas as tabelas (`GRANT … ON ALL TABLES`, no CI e no script local), então qualquer sessão de tenant poderia listar hashes e ids de todas as organizações. Também duplica dado e exige manter o índice sincronizado.                                                                               |
| **Policy de RLS por hash (escolhida)** | Uma segunda policy, **somente `FOR SELECT`**, libera a linha cujo `token_hash` é igual a `current_setting('app.satisfaction_token_hash')`. Sem `SECURITY DEFINER`, sem `BYPASSRLS`, sem tabela extra.                                                                                                                                                   |

Policy criada:

```sql
CREATE POLICY "ticket_satisfaction_surveys_token_lookup"
ON "ticket_satisfaction_surveys" FOR SELECT
USING ("token_hash" = nullif(current_setting('app.satisfaction_token_hash', true), ''));
```

Fluxo (`TicketSatisfactionService.locate`):

1. o token é validado pelo formato (43 caracteres base64url); fora do formato → 404;
2. numa transação própria, o serviço faz `set_config('app.satisfaction_token_hash', sha256(token), true)` (escopo da transação) e lê **apenas** `id` e `organization_id` da pesquisa pelo hash. Sem o tenant definido, a policy de isolamento não libera nada; a policy de lookup libera só a linha daquele hash. Outras pesquisas, solicitações e eventos continuam invisíveis;
3. o restante (dados do ticket, nome da organização, gravação da resposta, evento na timeline e auditoria) roda em `withTenant(organization_id)` com o `WHERE` repetindo `id`, `organization_id` **e** `token_hash` (protege contra um link regenerado no meio do caminho).

Por que é seguro: para ler uma linha é preciso conhecer o **pré-imagem** do hash (o token de 256 bits). Hashes nunca saem da API (o estado para a equipe não os inclui), e a policy não permite `UPDATE`/`DELETE` (a gravação exige o contexto do tenant). Token inexistente, de outro tenant, malformado ou invalidado respondem o **mesmo 404** `SATISFACTION_NOT_FOUND`.

## Regras

- **Criação**: dentro da transação existente de `TicketsService.changeStatus` (mudança mínima: uma chamada a `createOnResolution` quando `status = RESOLVED`). Se já existe pesquisa para a solicitação, nada acontece — reabrir e resolver de novo **não** cria outra, nem gera novo link;
- **Link devolvido uma vez**: a resposta de `POST /tickets/:id/status` que criou a pesquisa traz `satisfactionLink { url, expiresAt }`. A URL é `WEB_ORIGIN/avaliacao/<token>`. Não há como recuperar o token depois; se perdido, gera-se outro;
- **Novo link** (`POST /tickets/:id/satisfaction/link { version? }`): troca o `token_hash` (o anterior deixa de valer imediatamente), renova `expires_at` para +7 dias e incrementa `version`. Regras: sem pesquisa → 404 `TICKET_SATISFACTION_NOT_FOUND`; já respondida → 409 `SATISFACTION_ALREADY_RESPONDED`; solicitação fora de `RESOLVED`/`CLOSED` (ex.: reaberta) → 400 `TICKET_SATISFACTION_UNAVAILABLE`; `version` divergente → 409 `TICKET_SATISFACTION_VERSION_CONFLICT`. Link expirado pode ser renovado;
- **Resposta pública**: única; ordem das verificações: 404 (token) → 409 (já respondida) → 410 `SATISFACTION_EXPIRED` (expirado, `expires_at <= agora`). A gravação usa `updateMany … WHERE responded_at IS NULL` (corrida entre duas respostas simultâneas termina em 409). Nota inteira 1–5; comentário opcional, aparado, até 2000 caracteres (contrato + `CHECK` no banco); campos extras → 400;
- **Timeline**: a resposta grava um `COMMENT` **interno** com o corpo `Avaliação do cliente: N/5` (mais `Comentário: …` quando houver) e `metadata { source: "CUSTOMER_SATISFACTION", surveyId, rating }`. Como `ticket_events.author_user_id` é obrigatório (C5.1) e o cliente não é usuário, o evento fica em nome de quem resolveu a solicitação (`created_by` da pesquisa); a origem real fica em `metadata`. Não altera `tickets.version`;
- **Auditoria** (`entityType = ticket_satisfaction_survey`): `ticket.satisfaction_created` (na resolução), `ticket.satisfaction_link_generated` e `ticket.satisfaction_responded` (ator nulo, `requestId` e IP da requisição, nota e se houve comentário). A contagem de auditoria `entityType = ticket` da C5.1 não muda.

## API (`/api/v1`)

| Método e rota                                           | Permissão      | Resposta                                                                                                                                                                                         |
| ------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /tickets/:id/satisfaction`                         | `ticket.read`  | `{ survey: null }` antes da 1ª resolução, ou `{ survey: { id, ticketId, state (PENDING/RESPONDED/EXPIRED), expiresAt, rating, comment, respondedAt, createdAt, version } }` — sem token nem hash |
| `POST /tickets/:id/satisfaction/link { version? }`      | `ticket.write` | `{ survey, link: { url, expiresAt } }` (201)                                                                                                                                                     |
| `GET /public/satisfaction/:token`                       | pública        | `{ protocol, subject, organizationName, expiresAt }`                                                                                                                                             |
| `POST /public/satisfaction/:token { rating, comment? }` | pública        | `{ rating, respondedAt }` (201)                                                                                                                                                                  |
| `GET /reports/csat?from&to`                             | `reports.read` | ver Relatório                                                                                                                                                                                    |

Solicitação de outro tenant nas rotas autenticadas → 404 `TICKET_NOT_FOUND`.

## Relatório

`GET /reports/csat` (`CsatReportService`, SQL agregado em `withTenant`, com filtro explícito por organização além do RLS, padrão da C4.4):

- base: pesquisas do tenant cujas solicitações não foram excluídas; `from`/`to` (ISO com fuso, inclusivos) filtram `created_at` da pesquisa, isto é, a data da primeira resolução;
- `sent` (pesquisas geradas), `responded`, `responseRate = responded / sent`, `averageRating`, `distribution { "1".."5" }` e `csat = (notas 4 + 5) / responded`; taxas nulas quando o denominador é zero;
- query estrita (`CsatReportQuerySchema`): `from > to` ou parâmetros extras → 400.

Acréscimos no fim de `reports.controller.ts` (injeção por propriedade) e de `reports.module.ts`.

## Contratos

`packages/contracts/src/ticket-satisfaction.ts`: schemas de token, nota, resposta pública, geração de link, estado da pesquisa, link, página pública, query e relatório CSAT, as constantes `TICKET_SATISFACTION_TTL_DAYS`/`TICKET_SATISFACTION_COMMENT_MAX` e `summarizeCsat` (usada pela API e testada no pacote).

## Web

- detalhe da solicitação: bloco **Satisfação** (`ticket-satisfaction-panel.tsx`) com situação, nota, comentário, validade; mostra a URL devolvida pela resolução (uma vez) e o botão **Gerar link** (com `ticket.write`, pesquisa não respondida e solicitação resolvida/encerrada), com campo somente leitura e **Copiar link**;
- página pública `/avaliacao/[token]` (rota do Next.js fora do shell autenticado, `robots: noindex` e `referrer: no-referrer`): protocolo, assunto e organização, cinco opções (1 Muito insatisfeito … 5 Muito satisfeito), comentário opcional e mensagens próprias para link inválido (404), já respondida (409) e expirado (410);
- Resumo gerencial: aba **Satisfação** (`csat-view.tsx`) com CSAT, nota média, enviadas, respondidas, taxa de resposta e distribuição 1–5, filtros De/Até (início/fim do dia local).

## Fora do escopo

- envio do link por e-mail/WhatsApp e lembretes (Fase 4);
- limitação de taxa específica para os endpoints públicos (o token de 256 bits torna a enumeração inviável; limitação por IP fica para quando houver infraestrutura de borda);
- CSAT por responsável, fila ou canal; NPS; edição ou exclusão de resposta;
- invalidar a pesquisa quando a solicitação é cancelada depois de reaberta (a resposta continua aceita, pois se refere à resolução anterior).

## Critérios de aceite

1. A primeira resolução cria exatamente uma pesquisa (hash gravado, token só na resposta); reabrir e resolver de novo não cria outra nem devolve link.
2. Gerar novo link invalida o anterior (404) e respeita `version`, permissões (VIEWER 403) e o estado da solicitação.
3. Fluxo público completo: página com apenas protocolo, assunto, organização e validade; resposta única (409 na segunda), 410 expirado, 404 genérico para token inválido; evento interno na timeline e auditoria.
4. Isolamento sob a role de aplicação (`NOBYPASSRLS`): sem contexto nada é visível; com o hash, só aquela pesquisa e apenas leitura; o token de um tenant nunca expõe nem grava dados de outro.
5. Relatório com contagens, taxas, média, distribuição e CSAT% corretos por tenant e período; `reports.read` exigido.
