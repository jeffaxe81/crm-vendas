# F4.3-02B1 — Planejador seguro de alertas SLA por e-mail

Data: 10/10/2026. Base: F4.3-02 (PR #116, merge `9827c73ca298fff743c9f6f54a2c1945005a42bd`).

## Escopo

- Serviço `SlaEmailPlanner.enqueueDueAlerts(organizationId, now)`, invocado explicitamente. Não cria scheduler, endpoint ou envio automático neste incremento.
- Consulta tickets da organização com SLA por vencer nos próximos 30 minutos, status OPEN ou IN_PROGRESS e membro designado ativo, vinculado a usuário ativo.
- Não usa canal de contato externo para obter destinatário: alerta **operacional interno** vai apenas ao e-mail da conta do membro atribuído à solicitação.
- Dentre os vencimentos aplicáveis, escolhe o mais próximo. Só considera primeiro atendimento quando ainda não houve `firstResponseAt`.
- Composição por template com sanitização e inserção da mensagem criptografada no outbox via `enqueueTransactionalEmail` dentro de `withTenant`. Replays do mesmo SLA ficam idempotentes.
- Varredura paginada de todos os candidatos elegíveis, com limite de 100 alertas novos por ciclo (repetições não bloqueiam páginas seguintes). Testes PostgreSQL usam role RLS restrita, além de validação de deduplicação, criptografia, usuários inativos, vencimentos e org distinta.

## Gates antes de envio externo real

- A fila criada pode tornar-se obsoleta se um ticket for resolvido, seu responsável mudar ou o SLA for recalculado. **Não habilitar provedor ativo ou polling automático do worker sem revalidar o ticket, o destinatário e o SLA no momento do envio.**
- Uma futura implementação deve evitar duplicatas após crash entre aceitação remota e atualização local, expondo `idempotencyKey` ao fornecedor quando possível.
- O planejador não resolve por si só a autorização e o consentimento para pesquisas de satisfação; disparos a clientes externos continuam fora deste escopo.
- Configuração por tenant e autorização administrativa precisam preceder a habilitação de alertas em produção.
- F4.3-02B2: scheduler opt-in, revalidação de ticket/assignee na hora do envio, adapter de provedor seguro e testes adversariais com falhas de rede.
- F4.3-03: ingestão autenticada e triagem de e-mail, preservando isolamento e deduplicação.

## Verificação

CI integral com formatação, lint, typecheck, migrações/RLS, testes API (shards), frontend/contratos, E2E, Compose e build Docker. Sem merge sem testes verdes e autorização.
