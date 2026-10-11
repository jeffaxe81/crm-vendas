# F4.3-02D1 — Configuração de relay por organização (somente preparação)

Data: 10/10/2026. Base: PR #120; dependências #117 → #118 → #119 → #120.

## Funcionalidades

- Tabela `email_relay_settings` com **FORCE RLS**: uma linha por organização, histórico de modificações em `audit_logs`, controle otimista de versão e gatilho de segurança para manutenção.
- Controle administrativo em `GET /admin/email/relay-settings` e `PUT /admin/email/relay-settings`. Exige usuário ativo e administrador/superusuário da própria organização, além da permissão `integration.manage`.
- Modo `DISABLED` (padrão) ou `PREPARED` (configuração pronta para avaliação, **não** envio habilitado). Toda resposta exibe `sendingEnabled: false`.
- Endpoint HTTPS de relay validado, hostname exatamente igual à allowlist **exclusivamente do servidor**, sem IP, porta alternativa, fragmento, query ou credenciais na URL.
- Credencial Bearer criptografada em repouso com AES-256-GCM e vinculação da organização (AAD). A leitura nunca retorna o token, apenas `hasCredential`.
- Rotação e revogação via `bearerToken` novo ou `clearCredential: true` com controle de versão; decisões auditadas sem payload sensível.
- Chaves administrativas no ambiente: `EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY` (32 bytes base64), `EMAIL_RELAY_ALLOWED_HOSTNAME` (DNS permitido). Variáveis opcionais: ausência causa falha segura ao cadastrar relay/credencial.
- Nenhum link com `HttpsEmailRelayProvider`, nenhuma alteração de `DisabledEmailProvider`, nenhum scheduler, nenhum envio e nenhum CSAT.

## Exemplo de preparação

`PUT /admin/email/relay-settings` com corpo:

```json
{
  "version": 0,
  "mode": "PREPARED",
  "endpoint": "https://relay.example.test/v1/transactional",
  "bearerToken": "valor-fornecido-no-canal-autenticado"
}
```

O endpoint de exemplo só pode ser cadastrado se `EMAIL_RELAY_ALLOWED_HOSTNAME=relay.example.test` estiver ajustado pelo operador do servidor.

O retorno contém `version:1`, `mode:"PREPARED"`, `hasCredential:true`, `sendingEnabled:false`. Jamais retornar credencial, nem em auditoria.

## Gate obrigatório antes de produção

1. Validar contrato real de **idempotência durável** no provedor, com falha e reinício.
2. Restrição de egress na infraestrutura + TLS / DNS hardening, allowlist operacional e segredo em vault.
3. Worker por organização, governança de revalidação imediatamente antes do envio e política de múltiplos processos.
4. Ativação separada com chave global, aprovação administrativa, métricas, auditoria e procedimento de rollback.
5. Consentimento e gate independentes para pesquisas CSAT.

## Testes e integração

A suíte PostgreSQL/RLS verifica isolamento, criptografia, ausência de vazamento, permissões, allowlist, versionamento e desativação. Esta PR é empilhada sobre #120; **nenhum merge na `main` sem CI integral aprovado e revisão independente**.
