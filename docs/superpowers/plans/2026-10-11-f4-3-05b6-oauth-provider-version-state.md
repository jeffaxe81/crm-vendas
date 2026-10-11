# F4.3-05B6 — vincular estado OAuth à revisão da preferência de provedor

## Vulnerabilidade corrigida

Um grant pendente antes dependia somente do código `GMAIL` ou `MICROSOFT_365`. Se a organização escolhesse Gmail, mudasse para Microsoft 365 e voltasse a Gmail enquanto o estado OAuth estivesse válido, o grant antigo poderia ser consumido, mesmo que a escolha tivesse sido revista. Isso é especialmente sensível para uma futura callback que troca um código de autorização por credenciais.

## Comportamento

- Ao armazenar um estado PKCE/OIDC, capturar `email_provider_preferences.version` e `provider_code` com `FOR UPDATE` na transação tenant-scoped.
- Persistir a versão no novo campo `provider_preference_version` junto ao estado cifrado; a versão não é um segredo.
- No consumo de uso único, bloquear a mesma linha de preferência e exigir a versão **e** o código idênticos aos originais. Alteração e reversão do provedor não revalidam um estado antigo.
- Migração incremental acrescenta coluna nullable para compatibilidade com registros já existentes. Estados anteriores sem versão ficam **bloqueados** e expiram; nunca se atribui uma versão retroativamente.
- Falha transacional preserva o grant anterior para inspeção/expiração, sem entregar nonce, verificador PKCE ou código.
- Testes reais PostgreSQL/RLS verificam estado com versão, troca e volta ao Gmail, legado sem versão, isolamento e ausência de envio.

## Limites

Esta entrega continua _offline_. Não há controller, browser callback, troca real com provedor ou habilitação de envio. O `EmailModule` mantém `DisabledEmailProvider`, e a integração depende da cadeia de PRs OAuth #140–#154.
