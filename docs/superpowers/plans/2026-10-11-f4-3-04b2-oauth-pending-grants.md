# F4.3-04B2 — armazenamento temporário do fluxo OAuth

Issue #135. Continuação da #136 (biblioteca de intenção OAuth/PKCE offline).

## Implementação

- Tabela `email_oauth_pending_grants` somente para intenções OAuth transitórias, com `state_hash` globalmente único; nenhum `state` plaintext, código de autorização, access/refresh token ou mensagem.
- PKCE `codeVerifier` cifrado com AES-256-GCM, chave independente `EMAIL_OAUTH_PENDING_ENCRYPTION_KEY`, AAD vinculada à organização, administrador, provedor e hash do `state`.
- Serviço interno `EmailOAuthPendingGrantStore`: `stage` somente para admin ativo com preferência Gmail ou Microsoft 365 já selecionada; `consume` exige mesmo admin e tenant, permissão vigente e preferência igual.
- Consumo atômico `DELETE ... RETURNING` com expiração no relógio do PostgreSQL: uma tentativa vence, replay falha fechado e conteúdo não fica pendente após consumo. Erro de decriptação desfaz a transação.
- RLS `ENABLE/FORCE`, `WITH CHECK`, FK de membership, guarda de manutenção, auditoria sem segredos. Testes PostgreSQL com usuário `NOBYPASSRLS`.
- Tabela SQL deliberadamente não exposta no schema Prisma do domínio: a allowlist de snapshot foi alterada explicitamente para **não incluir** intenções transitórias em backup ou restore. Reavaliar migração para modelo Prisma antes de ampliar controles administrativos.
- Chave opcional no schema de ambiente, mas **obrigatória na construção do serviço**, evitando arranque de autenticação sem chave.

## Restrições de segurança

Nenhum controller, rota de callback, registro de `EmailModule`, exchange OAuth ou envio externo neste ciclo; produção segue `DisabledEmailProvider`. O serviço não infere tenant por e-mail, parâmetro da callback ou por estado sozinho. O callback futuro deverá reutilizar a sessão autenticada do administrador que iniciou a conexão e passar `organizationId`/`actorUserId` confiáveis.

## Pendências para conexão real

Criar endpoints administrados de início, callback seguro HTTPS, persistência cifrada de tokens de refresh, validação de ID token/issuer/audience/tenant/conta remetente, consentimento, revogação e rotação de chaves; revisar LGPD, quotas e homologação real por provedor. Proibir retries cegos de envio após aceitação ambígua. Testes e CI não substituem revisão independente.

Referências: https://developers.google.com/identity/protocols/oauth2/web-server ; https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
