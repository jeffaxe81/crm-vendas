# F4.3-02D2 — pré-validação do relay e portões de ativação

Data: 10/10/2026. Base: PR #121 (dependente de #120, #119, #118 e #117).

## Entregue

- `GET /admin/email/relay-readiness` protegido por autenticação, `integration.manage` e associação ADMIN ativa no próprio tenant.
- O diagnóstico valida somente aspectos observáveis **localmente**, em transação RLS: modo preparado, hostname da allowlist, chave de criptografia presente, integridade da credencial AES-256-GCM com AAD do tenant, compatibilidade com o construtor do adaptador HTTPS. Não retorna texto, destinatários, tokens, material criptografado ou detalhes de exceções.
- Itens que dependem da infraestrutura/relay externo retornam **`NOT_VERIFIED`**, nunca `PASS` automático: idempotência durável real do provedor, egress, DNS/TLS e aprovação operacional.
- `senderRegistration: BLOCKED`, `sendingEnabled: false` e `activationEligible: false` independentemente dos demais campos. A injeção em `EmailModule` continua usando `DisabledEmailProvider`.
- Simulador contratual determinístico testa uma aceitação confirmada após perda do ACK e reinício do adaptador, com o mesmo `Idempotency-Key`; este teste **não** demonstra o comportamento de um provedor real.

## Exemplo de resultado para organização preparada

```json
{
  "mode": "PREPARED",
  "version": 1,
  "sendingEnabled": false,
  "activationEligible": false,
  "checks": {
    "relayConfigured": "PASS",
    "hostnameAllowlisted": "PASS",
    "encryptionKeyPresent": "PASS",
    "credentialIntegrity": "PASS",
    "providerContractCompatible": "PASS",
    "durableProviderIdempotency": "NOT_VERIFIED",
    "networkEgressPolicy": "NOT_VERIFIED",
    "tlsAndDnsPinning": "NOT_VERIFIED",
    "externalApproval": "NOT_VERIFIED",
    "senderRegistration": "BLOCKED"
  },
  "blockers": [
    "durableProviderIdempotency",
    "networkEgressPolicy",
    "tlsAndDnsPinning",
    "externalApproval",
    "senderRegistration"
  ]
}
```

## Provas externas obrigatórias antes de qualquer envio real

1. **Idempotência persistente:** em um ambiente isolado do relay aprovado, repetir o mesmo hash SHA-256 no cabeçalho `Idempotency-Key` após aceitar o pedido, perder ACK, reiniciar o cliente e repetir. Registrar um único identificador canônico e apenas uma aceitação/enfileiramento upstream, com deduplicação durável, inclusive após reinício do **servidor relay**. Confirmar janela de retenção, política de conflitos payload/chave, consistência entre réplicas e reboots. Não usar endereços reais de destinatários.
2. **Egress e DNS:** implantar restrição de saída `TCP/443` exclusivamente para o relay autorizado, negar IP privado/loopback/link-local/metadata e redirecionamentos, verificar IPv4/IPv6, CNAME e DNS rebinding. A validação de URL **não** equivale a pinagem DNS nem a bloqueio de SSRF na camada de rede.
3. **TLS:** validar CA, SNI, correspondência de hostname, verificação de certificado, timeout, nenhuma exceção `rejectUnauthorized`; testar certificado expirado/host divergente e rotação.
4. **Contrato HTTP:** retornos 200/201/202 com `messageId` canônico; 4xx somente quando houve rejeição inequívoca; 5xx, perda de conexão e corpo inválido tornam a aceitação **ambígua**. Um ACK 2xx não equivale a entrega na caixa do destinatário.
5. **Segredos e auditoria:** permitir apenas administradores e operadores autorizados, secret manager, rotação e revogação; nunca registrar token ou conteúdo do e-mail em logs, rastreamento, auditoria ou backup.
6. **Ativação:** exigir nova alteração de código revisada, chave de habilitação global e por tenant, confirmação humana expressa, monitoramento, limites de volume, reversão e revalidação do SLA imediatamente antes do envio. Não ligar scheduler nem worker nesta etapa.
7. **CSAT:** manter separado, exigindo escopo, base legal, consentimento e aprovação específica.

## Operação segura

- Consultar `GET /admin/email/relay-settings` e posteriormente `GET /admin/email/relay-readiness`.
- Mesmo que os cinco primeiros checks retornem `PASS`, **não enviar**: as provas externas continuam `NOT_VERIFIED` e o envio `BLOCKED`.
- Nenhuma simulação, teste de contrato, leitura de prontidão ou acesso ao endpoint efetua chamada externa.
- Revisão independente e CI integral são pré-requisitos do merge; ordem da pilha: #117 → #118 → #119 → #120 → #121 → esta PR.
