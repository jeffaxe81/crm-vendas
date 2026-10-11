# F4.3-05B4 — Troca confidencial OAuth isolada

Semana antecipada: endpoints de token fixos Google/Microsoft e client_secret de servidor, com POST PKCE, sem redirects/retries/cache/cookies, timeout 5s e corpo limitado a 64 KiB.

O resultado fica classificado como UNVERIFIED e sendingEnabled=false. Não valida JWT, remetente, consentimento nem identidade; o verificador OIDC/JWKS das PRs anteriores continua obrigatório. Refresh token ausente causa falha fechada.

Este componente não está ligado a controllers ou EmailModule e não executa chamadas na aplicação. Os testes usam transporte simulado, sem credenciais externas. O registro seguro de client_secret, callback autenticado, identidade Microsoft Graph /me, revogação e homologação ainda estão pendentes.

Sequência de dependências: PR #140, #141, #143, #144, esta PR. Exigir revisão independente de segurança e CI aprovado antes de merge. DisabledEmailProvider continua o padrão.

Documentação oficial:
https://developers.google.com/identity/protocols/oauth2/web-server
https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
