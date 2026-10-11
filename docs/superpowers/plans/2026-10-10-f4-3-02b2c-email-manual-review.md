# F4.3-02B2C — Reconciliação administrativa da fila de e-mail

Data: 10/10/2026. Base: PR #119 (dependente de #118 e #117).

## Entrega

- Endpoint protegido `GET /admin/email/manual-review?limit=50`: somente administradores ativos, com permissão `integration.manage`, dentro do tenant autenticado. Consulta limitada a 100 registros, sem descriptografar, exibir e-mails, corpos ou credenciais.
- Endpoint protegido `POST /admin/email/manual-review/:id/resolve`: decisão explícita, somente após consulta humana às evidências no relay de correio.
- Decisão `CONFIRMED_ACCEPTED`: exige `providerMessageId` e `evidenceReference`. Atualiza de `MANUAL_REVIEW` para `ACCEPTED` (aceitação pelo relay, **não** comprovação de entrega ao destinatário).
- Decisão `CONFIRMED_NOT_ACCEPTED`: exige prova de que o relay não aceitou a solicitação. Atualiza para `CANCELLED`; **não** reageenda nem reenvia.
- Se houver incerteza, **não chamar o endpoint de resolução**. Manter o evento em `MANUAL_REVIEW` e investigar junto ao provedor.
- Mudança de estado com condição atômica `status=MANUAL_REVIEW`, sem possibilidade de aplicar a decisão duas vezes; trilha `audit_logs` na mesma transação e sob RLS, com ator, requestId, tipo, estado anterior/posterior, referência de evidência.
- Não ativa relay HTTPS, SMTP, scheduler, automação de retransmissão ou pesquisa CSAT. `DisabledEmailProvider` permanece registrado em `EmailModule`.

## Procedimento operacional

1. Consultar `GET /admin/email/manual-review` com conta administradora autorizada.
2. Com `idempotencyHash` (chave de correlação interna), consultar os registros do relay, **sem** copiar dados pessoais ou credenciais para o campo de evidência.
3. Se o relay confirmar aceitação, fornecer `decision=CONFIRMED_ACCEPTED`, referência operacional da investigação e `providerMessageId`.
4. Se o relay fornecer prova inequívoca de não aceitação, usar `decision=CONFIRMED_NOT_ACCEPTED` com referência. A entrada continua terminal.
5. Sem prova confiável, deixar em `MANUAL_REVIEW`. Não tentar reenviar manualmente o mesmo conteúdo.
6. Conferir auditoria em `GET /admin/audit`.

## Validação

- Testes PostgreSQL/RLS em `email-manual-review.integration.spec.ts`: isolamento entre organizações; permissões e revogação de membro; ausência de exposição de destinatário; aceitação com recibo; cancelamento definitivo; log atômico; dupla resolução impedida.
- CI completo necessário antes de converter esta PR de Draft em Ready e antes de qualquer merge.
- Esta PR está empilhada sobre #119; sequência obrigatória: **#117 → #118 → #119 → esta PR**; não mesclar sem a revisão independente das anteriores.

## Fora do escopo (próxima microentrega)

- Configuração por organização, segredos e permissões de egress do relay.
- Verificação real de idempotência persistente do provedor sob perda de respostas e reinício.
- Interface administrativa gráfica, métricas e limites de rate/concurrency.
- Consentimento explícito, privacidade e templates de satisfação (CSAT).
- Qualquer habilitação de saída externa exige aceite operacional separado.
