# F4.3-04B4 — registro de aplicativos OAuth, controlado pelo servidor

**Depende das PRs #137 e #138; não faz merge automático.**

Este incremento implementa `EnvironmentEmailOAuthClientResolver`, que atende à interface da PR #138 e resolve IDs de aplicativo OAuth por empresa/provedor **somente a partir de configuração privada de implantação**. Nenhuma credencial, token ou cadastro de cliente é aceito do navegador.

## Configuração de implantação (desativada por padrão)

As duas variáveis opcionais devem ser fornecidas juntas ao servidor da API:

- `EMAIL_OAUTH_CALLBACK_ORIGIN=https://crm.example.com` (origin HTTPS canônico, domínio público DNS, sem path, userinfo, query, porta nem fragment)
- `EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON={"version":1,"registrations":[{"organizationId":"<UUID_EMPRESA>","provider":"GMAIL","clientId":"123456789012-exampleclient.apps.googleusercontent.com"},{"organizationId":"<OUTRO_UUID_EMPRESA>","provider":"MICROSOFT_365","clientId":"<APPLICATION_UUID>","microsoftTenantId":"<DIRECTORY_UUID>"}]}`

O URI de retorno será derivado exclusivamente do origin aprovado, fixado como `https://crm.example.com/admin/email/oauth/callback`. Esse endereço deve estar registrado *exatamente* nas configurações do provedor; a rota atual da PR #138 **descarta códigos de autorização e não conecta contas**.

O schema aceita somente `version`, `registrations` e os campos da lista. `clientSecret`, `refreshToken` e propriedades desconhecidas são rejeitados. Client IDs OAuth não são segredos; *não* configure client secrets ou tokens nesse JSON. O resolver não faz chamadas de rede, não é instanciado em `EmailModule` e não cria endpoints.

## Controles

- Configuração inválida, parcial, duplicada, excessiva ou domínio suspeito falha fechado; erros não refletem valores do ambiente.
- IDs Google e UUIDs Microsoft validados; `microsoftTenantId` explícito (não `common`); seleção de chave composta `organizationId:provider`.
- Bloqueio de domínios locais/IP, credenciais em URL, protocolo HTTP, redirects com query/fragmentos e configurações cross-tenant.
- Testes unitários offline também compõem o gerador de autorização PKCE da PR #136.

## Ainda pendente

1. Revisão de segurança independente das PRs #137/#138/#139 e revisão de deployment, incluindo repasse das variáveis ao contêiner da API.
2. Fluxo HTTP administrado e limitador de taxa com sessão de navegador forte; vínculo de callback à mesma sessão/navegador iniciador e proteção contra login CSRF.
3. Token exchange com segurança de client authentication apropriada ao tipo de aplicação, verificação de assinatura/issuer/audience/tenant/identidade, armazenamento cifrado e rotação de refresh tokens.
4. Desconexão, testes reais homologados Google/Microsoft, governança de consentimento e ativação operacional explícita.
5. Envio permanece exclusivamente `DisabledEmailProvider` até aprovação.

A lista de provedores (Gmail, Microsoft 365 e outros) da PR #134 permanece a mesma. Os demais provedores terão integrações específicas posteriormente.
