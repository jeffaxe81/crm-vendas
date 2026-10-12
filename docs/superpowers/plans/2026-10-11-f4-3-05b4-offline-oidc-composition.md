# F4.3-05B4 — Composição offline JWKS + identidade OAuth

Issue #146. Esta microentrega depende da cadeia #140 → #141 → #143 → #144.

## Entrega

`EmailOAuthOidcIdentityService` utiliza `EmailOAuthPinnedJwksReader` com endpoints de chaves públicas previamente fixados por provedor e `verifyOfflineOidcIdToken` para validar assinatura RSA SHA-256, issuer, audience, nonce, expiração, subject e tenant Microsoft. O retorno é somente `VerifiedOidcIdentity`, que **não é** autorização para envio.

Os valores `provider`, `clientId`, `microsoftTenantId` e `oidcNonce` devem ser montados **somente a partir de configuração do servidor e de pending grant autenticado, atrelado à sessão e consumido uma vez**; nunca dos parâmetros da URL externa, do corpo HTTP, do JWT ou do browser. Uma identidade Google exige e-mail verificado; `preferred_username` da Microsoft **não** é identidade de remetente validada e exige resolução posterior via Microsoft Graph.

O serviço não faz refresh sob falha de assinatura, para impedir consultas remotas a cada token malicioso. A rotação de chave é conduzida pelo cache de curta duração (5 minutos) do leitor ou refresh explícito por uma futura operação autenticada com limites. A expiração do JWKS bloqueia a verificação caso o endpoint esteja indisponível.

## Segurança / limites

- Nenhum controller/callback OAuth foi registrado em `EmailModule` nesta PR.
- Não há troca de `code` por tokens, conexão ou autenticação real com Google ou Microsoft.
- Não há envio externo, worker, agendamento, telemetria de claims brutos ou tokens persistidos por este serviço.
- Erros externos e internos são convertidos para `EMAIL_OAUTH_IDENTITY_VERIFICATION_FAILED`, sem incluir claims, URL, nonce, JWT, tokens ou dados de chave.
- `DisabledEmailProvider` deve continuar sendo o provedor ativo.

## Homologação futura

Antes de conectar contas reais: validar state + sessão/tenant/ator, consumir transação uma única vez, usar PKCE, URL callback HTTPS fixa, validar OIDC com este serviço, trocar código em endpoint fixo com client autenticado, criptografar tokens por tenant, validar remetente, registrar auditoria minimizada, obter consentimento e poder revogar. Reconciliar falhas ambíguas sem reenvio automático. Microsoft Graph `202 Accepted` **não prova entrega**.

## Gates

Revisão humana independente de cada PR da cadeia, CI com `main` e esquema PostgreSQL/RLS, E2E e builds. Sem estas etapas não declarar integração concluída. O corte de CRM 1.0 pode ocorrer **sem envio externo**, se os demais gates mínimos forem comprovados.
