# F4.3-04A — catálogo e seleção de provedores de e-mail por empresa

Issue #133. A seleção do provedor **não** concede autorização para enviar mensagens.

## Entrega

- Tela em **Administração → Diagnóstico de e-mail** com seleção de Gmail/Google Workspace, Microsoft 365/Outlook, Resend, Amazon SES, SendGrid, Mailgun, SMTP e relay HTTPS.
- Preferência independente por organização, protegida por autorização administrativa, isolamento PostgreSQL `ENABLE/FORCE RLS`, `WITH CHECK`, gatilho de manutenção, controle otimista de versão e auditoria.
- O estado inicial de cada empresa é `NONE`. A API retorna somente código do provedor, versão, catálogo e `sendingEnabled=false` com `connectionStatus=NOT_CONNECTED`.
- Nenhum token OAuth, segredo API ou senha é aceito ou persistido nesta fase.
- `EmailModule` conserva a implementação `DisabledEmailProvider`. O worker, a outbox, as regras de SLA e a configuração anterior de relay **não recebem vínculo dinâmico** a partir da escolha. Mesmo `HTTPS_RELAY` continua desativado.
- Registro em inventário de backup `EXCLUDE/PRESERVE`, evitando que restaurações alterem preferências operacionais ou exponham configurações de segurança.

## Futuras etapas por conector

1. **Gmail / Google Workspace:** fluxo OAuth 2.0 por organização/conta; escopo mínimo `gmail.send`; renovar e revogar tokens cifrados; usar `users.messages.send` após consentimento. Evitar armazenar senha de Gmail. A conta e a identidade remetente exigem validação antes de envio.
2. **Microsoft 365 / Outlook:** OAuth e Microsoft Graph `sendMail`, `Mail.Send` delegado ou da aplicação; controlar explicitamente quais caixas e organizações podem enviar.
3. **Resend / SendGrid / Mailgun:** APIs dedicadas e credenciais de escopo mínimo, armazenadas com criptografia autenticada; considerar capacidade real de idempotência e limites.
4. **Amazon SES:** API assinada AWS IAM ou SMTP autorizado; proteger credenciais temporárias e identidade remetente.
5. **SMTP ou relay empresarial:** TLS verificado, domínios/portas de saída explicitamente permitidos e política anti-SSRF. Suporte moderno a OAuth onde existir.

Exigir validação SPF/DKIM/DMARC, limites por empresa, auditoria segura, fila idempotente, verificações antiabuso, revogação e tratamento de erros antes de qualquer ativação. **Nenhum resultado de `sendMail` ou `messages.send` implica necessariamente entrega à caixa do destinatário.** Conexões/credentials, testes reais e ativação por empresa devem ocorrer em PR e gate separados.

Recebimento inbound de e-mails continua no plano F4.3-03B e não faz parte deste seletor de **envio**.

## Referências oficiais

- Google Gmail: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- Microsoft Graph: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- Amazon SES: https://docs.aws.amazon.com/ses/latest/dg/send-email-api.html
- Resend: https://resend.com/features/email-api

## Critérios de integração

CI integral verde no SHA final, testes de integração com papel PostgreSQL sem `BYPASSRLS`, testes de frontend, revisão de segurança, e CI de `main` após merge. **Não liberar tráfego real** sem etapa própria de homologação do provedor.
