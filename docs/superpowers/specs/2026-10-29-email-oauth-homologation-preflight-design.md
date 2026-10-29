# Email OAuth Homologation Preflight — Design

## Intent
Dar à issue #135 um preflight sanitizado de prontidão para homologação Gmail/Microsoft 365 sem habilitar envio externo.

## Goals
- validar presença e coerência das chaves/configurações OAuth por tenant/provedor;
- confirmar registro público, segredo servidor-only e chaves de criptografia sem revelar valores;
- distinguir configuração incompleta de pronta para teste controlado;
- preservar `DisabledEmailProvider` como transporte efetivo.

## Non-goals
- não trocar o provider ativo;
- não enviar e-mail real;
- não validar consentimento externo nem quotas do Google/Microsoft;
- não imprimir IDs sensíveis, tokens ou secrets.

## Approach
Função pura/serviço de preflight retorna apenas flags e códigos sanitizados. Reutiliza o resolver existente para validar registro/callback e aplica validação de presença/formato do segredo e chaves. O resultado máximo é `READY_FOR_CONTROLLED_HOMOLOGATION`, nunca `SENDING_ENABLED`.

## Acceptance
Testes cobrem configuração ausente, registro de outro tenant, segredo malformado, chaves ausentes e configuração completa, além do release guard existente que mantém envio desabilitado.
