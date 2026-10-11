# F4.3-03B1 — validação offline de origem para e-mail

Issue #130. Base: `main` após #129. Implementação independente de transporte.

## Contrato interno (proposto, não homologado com provedor)

Um adaptador futuro **não deve** confiar em nenhum campo de identidade recebido no corpo. Ele deverá recuperar `routeKey`, `keyId`, timestamp, assinatura e os **bytes exatos** do envelope, sem decodificação, normalização ou reserialização antes de verificar a assinatura.

A `InboundSourceVerifier` recebe somente bindings previamente confiáveis, no seguinte formato:

- `routeKey`: alias técnico opaco para consulta; não é prova de identidade;
- `keyId`: identifica uma chave de assinatura dentro desse alias;
- `sourceKey`: origem interna confiável, compatível com `inbound_messages.source_key`;
- `organizationId`: UUID definido no cadastro seguro da origem, nunca vindo do payload;
- `secret`: chave HMAC de pelo menos 32 bytes, já recuperada de um cofre de segredos confiável;
- `enabled`: fonte desativada deve ser sempre rejeitada.

O texto autenticado é composto por:

```text
crm-vendas.email.inbound.v1\n
<timestamp-decimal-em-segundos>\n
<routeKey>\n
<keyId>\n
<bytes exatos do corpo>
```

Assinatura: `v1=<HMAC-SHA256 em hex minúsculo>`. A função verifica a assinatura com comparação de tempo constante e aceita no máximo 300 segundos de desvio do relógio. Limite de corpo: 256 KiB, **somente para este contrato preliminar**. Não há suporte a anexos nem ingestão de mensagens reais.

A autenticação é fail-closed para bindings duplicados, troca de tenant sob o mesmo `routeKey`, origem desabilitada, assinatura inválida, relógio incorreto e chave fraca. Múltiplas chaves por origem permitem a futura rotação, sem migração de tenant.

## Garantias e limites

A biblioteca é **pura e isolada**: nenhum controller, rota, provider ativo, consulta de banco de dados, configuração administrativa de secrets, persistência, automação ou envio remoto. Não cria qualquer escrita na tabela `inbound_messages` entregue na #129. `EmailModule` mantém `DisabledEmailProvider`.

Esta assinatura é um **contrato interno proposto**. Provedores de e-mail reais podem utilizar outros esquemas (webhook, JWS, mTLS ou assinatura nativa); cada adaptador exigirá validação específica de autenticação, canonicalização e versão **antes** de utilizar esta interface. Não interpretar a existência desta biblioteca como homologação de um provedor.

O controle de tempo limita a exposição, mas **não impede replay dentro da janela**. Antes de aceitar uma mensagem real, a etapa subsequente deve assegurar idempotência durável e atômica por organização/origem/identificador autenticado, com HMAC de ID externo usando chave segregada da chave de assinatura. Mensagens sem ID estável autenticado devem ser rejeitadas. A disponibilidade da chave de assinatura e do serviço de configuração também deve ser resolvida sem fail-open.

A etapa F4.3-03B2 deve definir cadastro controlado de origem, cofre de segredos, rotação e revogação, auditoria sem dados sensíveis e integração futura com armazenamento cifrado. Nenhum endpoint de ingestão, ativação de relay, vínculo automático com ticket ou reutilização para WhatsApp está autorizado.

## Gate de integração

- CI integral da PR no SHA final;
- revisão de segurança sobre framing HMAC, segregação de tenant, tamanho, clock skew e compatibilidade com origem real;
- CI pós-merge na `main`;
- novo gate operacional, separado, obrigatório antes de qualquer tráfego externo.
