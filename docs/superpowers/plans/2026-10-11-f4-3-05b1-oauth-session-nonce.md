# F4.3-05B1 — OAuth com vínculo à sessão e nonce OIDC

- O gerador OAuth passa a gerar nonce aleatório independente do state e PKCE.
- O nonce é guardado com AES-GCM e AAD separado do PKCE, vinculado à organização, administrador, provedor e hash de state.
- O registro de autorização passa a exigir session_id da mesma sessão autenticada do CRM no início e no consumo. Sessões revogadas/expiradas são rejeitadas.
- A migração invalida intenções de 5 minutos anteriores (TRUNCATE da tabela transitória) e adiciona FK e verificação de ciphertext.
- O consumo atômico retorna nonce apenas ao backend para validação **posterior**, após verificação criptográfica do ID token do provedor.
- Nenhum callback autenticado ativo, JWT/OIDC verifier, troca de tokens, integração à rede, endpoint de conexão ou envio externo é disponibilizado.
- EmailModule continua DisabledEmailProvider. Revisão independente de segurança é gate antes de merge/ativação.

Referências: https://developers.google.com/identity/openid-connect/openid-connect e https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
