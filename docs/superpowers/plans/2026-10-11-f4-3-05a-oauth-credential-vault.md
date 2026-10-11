# F4.3-05A — cofre transitório de credenciais OAuth (sem envio)

Complemento às PRs #136–#139 já integradas à `main`. Esta PR isola o armazenamento cifrado de tokens OAuth de Gmail e Microsoft 365; **não** conclui OAuth real.

## Modelo e controles

- Tabela `email_oauth_credentials` por `(organization_id, provider_code)`, com Row-Level Security `ENABLE` + `FORCE`, política `WITH CHECK` e guarda de manutenção multi-tenant.
- `EmailOAuthCredentialVault.stageVerified` aceita apenas chamadas internas futuras de um verificador criptográfico de identidade do provedor, **ainda não implementado**. O código valida sintaxe e associação do administrador/empresa/provedor, mas **não comprova sozinho o ID token, a conta ou a posse do e-mail**. Não há controller nem ligação ao módulo de envio.
- Refresh token e remetente cifrados individualmente usando AES-256-GCM e AAD com organização, provedor, versão e finalidade; hash HMAC (não hash simples) para o identificador do provedor.
- Chave dedicada `EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY` em base64 canônico de 32 bytes, separada das chaves de PKCE e de webhooks. Configuração opcional; o cofre falha fechado se instanciado sem uma chave válida.
- Versionamento otimista com INSERT condicional / UPDATE ... WHERE version, evitando um callback antigo sobrescrever token renovado.
- `status` retorna só metadados, com `connectionStatus: STAGED_ONLY` e `sendingEnabled: false`; nunca devolve token, e-mail ou identificador de conta.
- `deleteLocal` remove o registro cifrado com controle de versão, invalida estados OAuth pendentes do mesmo provedor e registra auditoria sem segredos. **Não revoga o consentimento no Google/Entra**; revogação remota e tratamento de falha de revogação são uma etapa separada.
- Esta tabela é **deliberadamente excluída** do snapshot/restore multiempresa (não copiar credenciais de um ambiente restaurado).

## Testes

PostgreSQL com usuário RLS, isolamento entre empresas, permissões, não exposição do token/remetente/HMAC nos logs, criptografia AAD, versão concorrente, remoção local de credenciais e estados pendentes, validação de chave e continuação do `DisabledEmailProvider`.

## Próximos gates (sem aprovação não liberar conexão/envio)

1. Revisão independente de segurança também retroativa às PRs anteriores.
2. Implementação de callback autenticado, consentimento e validação de issuer, assinatura e audience de ID token, tenant Microsoft, remetente autorizado e anti-CSRF/session binding.
3. Exchange OAuth com autenticação do cliente apropriada, políticas de egress/timeout, proteção contra SSRF, rate-limit e refresh token rotation.
4. Revogação remota, desconexão tolerante a falha, descarte seguro de chaves e observabilidade sem vazamento.
5. Homologação com tenants de teste Google/Microsoft; somente um gate operacional posterior pode substituir `DisabledEmailProvider`. Nunca equiparar aceitação por API a entrega.
