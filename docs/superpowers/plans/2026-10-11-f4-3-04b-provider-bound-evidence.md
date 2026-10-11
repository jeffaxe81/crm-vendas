# F4.3-04B — vínculo da evidência ao provedor escolhido

## Motivação

O catálogo de provedores por organização passou a incluir Gmail/Google Workspace, Microsoft 365/Outlook e serviços SMTP/API, sem conectá-los. As evidências do relay só estavam ligadas a `EmailRelaySettings.version`. Ao alternar o provedor escolhido, uma evidência de homologação anterior poderia continuar aparecendo como atual e receber revisão administrativa.

## Entrega

- No registro auditado `email.relay_evidence.recorded`, capturar **versão** e **código** atuais de `EmailProviderPreference`, além da versão do relay, sempre sob `withTenant`. Quando não há preferência, registrar `NONE` / versão `0`.
- Na revisão `email.relay_evidence.reviewed`, comparar versão e código atuais do provedor com os valores imutáveis da submissão. Impedir a análise quando houve seleção, troca ou nova gravação do provedor — mesmo que a configuração HTTPS não tenha mudado.
- Na listagem, retornar `currentConfiguration` para submissão e revisão, considerando tanto o relay quanto o provedor. Referências legadas sem campos do provedor são conservadoramente **desatualizadas** e não são passíveis de revisão sem nova submissão.
- Mostrar no painel o provedor/versão associado a cada evidência e alertar para reenvio de uma referência quando desatualizada. Desabilitar botões de revisão para essas referências.
- Testar isolamento multiempresa PostgreSQL/RLS, submissão com seleção `NONE`, mudança de Gmail para Microsoft 365, regravação do mesmo provedor e registros antigos.

## Restrições explícitas

- `CHECKED` significa apenas exame independente da referência, não comprovação de contrato, idempotência, TLS/DNS, egress nem autorização de envio.
- `EmailModule` continua ligado a `DisabledEmailProvider`; nenhuma conexão Gmail/Microsoft/SMTP, chamada de rede, envio de mensagem, armazenamento de credencial ou ativação.
- `EmailRelayReadinessService` continua apresentando os gates externos como `NOT_VERIFIED` e `senderRegistration` como `BLOCKED`. `sendingEnabled` e `activationEligible` permanecem `false`.

## Integração

Branch derivada da `main` consolidada após as PRs #117–#124, #126 e F4.3-04A. Revisão, CI e merge sujeito às proteções do repositório.
