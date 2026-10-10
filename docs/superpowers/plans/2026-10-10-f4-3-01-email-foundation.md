# F4.3-01 — Fundação de e-mail transacional

Data: 10/10/2026. Base: F4.3 do plano canônico da Fase 4.

## Objetivo e recorte entregue

Definir contrato único de envio para provedores, composição determinística de alertas SLA/pesquisas de satisfação e isolamento de falhas do provedor, sem gerar tráfego externo por padrão.

- `EMAIL_PROVIDER`: porta única `EmailProvider.send()`, cujo retorno indica apenas aceitação do provedor (não entrega em caixa postal).
- `DisabledEmailProvider`: configuração padrão que recusa todo envio. Nenhuma credencial SMTP/API foi introduzida.
- `EmailDispatchService`: normaliza sucesso e falhas controladas sem repassar detalhes sensíveis do provedor para o negócio.
- `composeSlaDueEmail()`: prepara alerta de SLA com identificador estável e HTML escapado.
- `composeSatisfactionEmail()`: prepara solicitação de avaliação a partir de link seguro gerado pelo backend, com idempotência por versão da pesquisa.
- Regressões cobrindo header injection, HTML, URL, ausência de provedor, erro remoto e idempotency key estável.

## Restrições de segurança

1. A composição não consulta dados fora do tenant nem determina destinatários: futuras consultas de contatos devem passar por `withTenant()`, papéis e RLS.
2. A composição não permite HTML arbitrário de usuários ou credenciais em URLs; destinatários não aceitam CRLF ou display names.
3. O retorno de falha não inclui resposta do provedor ou segredos. O email não deve ser logado em claro.
4. Não chamar o provedor dentro da transação que grava o ticket, nem fazer I/O na transação. O processamento real será via outbox persistente pós-commit.
5. A chave de idempotência é apenas um identificador lógico; para garantia de não duplicação, a próxima microentrega precisa de constraint única, tentativas e deduplicação na persistência.
6. Nenhum e-mail é efetivamente enviado por este incremento; configuração de provedor exige etapa própria, credenciais seguras, verificação do remetente, políticas de TLS, teste e autorização.
7. Nenhum endpoint de recebimento foi criado; a futura ingestão deve autenticar o provedor e resolver organização por configuração, nunca pelo corpo da mensagem.

## Próximas microentregas

- **F4.3-02:** modelo de notificações de saída/outbox por organização, RLS ENABLE/FORCE, transação atômica, limites/retry e worker com adaptador explicitamente habilitado. Integrar os gatilhos reais de SLA e satisfação com autorização de destinatário.
- **F4.3-03:** `InboundMessage` EMAIL, assinatura/verificação do mecanismo de recebimento, idempotência por identificador externo e organização, preservação segura de conteúdo e triagem manual para Contato/Solicitação.
- **F4.3-04:** interface operacional, configuração de provedor, E2E, auditoria e homologação sem mensagens externas nos testes.

## Critérios de verificação deste PR

- Testes de composição e despacho.
- `pnpm format:check`, lint, typecheck, todos os testes do repositório, E2E, migrações PostgreSQL/RLS, Compose e build de imagens via workflow.
- Branch separada e PR Draft; não marcar F4.3 como concluído e não mesclar sem CI integral verde e revisão técnica.
