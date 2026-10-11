# F4.3-05B5 — validação offline dos parâmetros de callback OAuth

Issue #153. Dependências: #140 → #141 → #143 → #144 → #148. Esta etapa não registra rota HTTP, não realiza OAuth real e não libera e-mails.

## Motivação

As respostas de autorização do Google/Microsoft normalmente retornam `code` e `state` no redirect. O valor de `state` deve ser validado no servidor para prevenir CSRF e garantir o mesmo fluxo que foi iniciado. A presença de `error` indica falha/negação da autorização e **não deve** permitir troca de código. Respostas com duplicidade de parâmetros podem provocar interpretações divergentes entre componentes.

## Contrato seguro

`parseEmailOAuthCallbackQuery(rawQuery)` recebe a **query string bruta** iniciada em `?`, jamais um URL arbitrário nem os headers do request. Rejeita `error`, `error_description`, `error_uri`, parâmetros duplicados, desconhecidos, CRLF, escapes percent malformados, ausência de `code`/`state` e excesso de tamanho. A função descarta informações opcionais não privilegiadas que alguns provedores enviam, como `scope`, `authuser`, `prompt`, `session_state`, `iss` e `hd`. Esses campos **não** estabelecem provedor, empresa, caixa postal, autorização nem consentimento.

O parse do `state` verifica somente o formato base64url de 43 caracteres. A prova real é o vínculo atômico ao `stateHash` **já armazenado e de uso único** em `EmailOAuthPendingGrantStore.consume`. Um state bem formatado não valida identidade nem sessão.

## Ordem obrigatória do callback futuro

1. Controller da rota fixa `/admin/email/oauth/callback` em domínio HTTPS configurado pelo servidor (não confiar em Host/X-Forwarded-* sem proxy confiável).
2. Validar sessão ativa por cookie seguro/CSRF e principal da organização, usuário e sessão; não aceitar identidade ou provider provenientes do query.
3. Executar `parseEmailOAuthCallbackQuery`. Se houver erro, rejeitar genericamente sem logar code/state/descrição.
4. Consumir `state` uma única vez com `EmailOAuthPendingGrantStore.consume(state, principal)`.
5. Resolver client OAuth confiável a partir da organização e `grant.provider`. Rejeitar redirect e configurações divergentes; só então trocar código por tokens num endpoint de provedor fixo.
6. Verificar ID Token com JWKS HTTPS pinado e `nonce` do grant; validar issuer, audience, tenant Microsoft e identidade do remetente, incluindo Graph /me quando aplicável.
7. Armazenar credenciais cifradas por empresa, com CAS, revogação, auditoria e sem permitir envio até homologação.
8. Rejeitar erro ambíguo/timeout de token exchange sem repetir automaticamente o mesmo código.

## Gates

- Integração ordenada das PRs dependentes.
- CI integral e revisão independente de segurança. Nenhum teste simulado substitui teste de consentimento real e verificação operacional.
- `DisabledEmailProvider` permanece ativo.

Referências oficiais:

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
