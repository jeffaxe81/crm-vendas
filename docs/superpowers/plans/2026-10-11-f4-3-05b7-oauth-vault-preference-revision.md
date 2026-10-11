# F4.3-05B7 — vínculo da preferência OAuth até o cofre cifrado

Issue #161. Incremento sobre PR #158, dependente da cadeia #140 → #141 → #143 → #144 → #148 → #154 → #158.

## Falha de tempo de verificação / tempo de uso (TOCTOU)

A PR #158 já vincula o `state` de uma autorização à **versão** da preferência de provedor. Porém, entre consumir o estado e gravar o token no cofre, a empresa ainda poderia alterar a preferência e selecionar novamente o mesmo provedor. Uma simples comparação do código `GMAIL` não é suficiente.

## Contrato

- `EmailOAuthPendingGrantStore.consume` passa a devolver `providerPreferenceVersion` validada na transação, **somente ao backend**. PKCE e nonce permanecem segredos efêmeros.
- `EmailOAuthCredentialVault.stageVerified` exige `expectedProviderPreferenceVersion` como inteiro positivo (valor **do grant consumido**, nunca do navegador).
- A mesma transação do armazenamento cifrado usa `SELECT provider_code, version ... FOR UPDATE`, com RLS de empresa, e somente aceita código e versão iguais. A transação segura o bloqueio até concluir o CAS de versão da credencial e auditoria.
- Se o provedor foi trocado, regravado ou retornou ao código anterior, uma credencial vinculada à versão antiga falha de forma conservadora.
- Revisões válidas continuam permitindo rotação criptografada pelo controle otimista já existente do cofre.
- A auditoria contém somente revisão e metadados, nunca segredos.

## Testes

PostgreSQL com papel RLS: propagação da versão do grant, token inicial, rotação válida, versão obsoleta, troca Gmail → Microsoft 365 → Gmail, mudança de versão sem mudança de código, concorrência, revogação local e `DisabledEmailProvider`.

## Limites e gates

Sem controller OAuth, fluxo de consentimento real, Gmail API/Microsoft Graph ativo, envio de mensagens ou configuração de workers. `DisabledEmailProvider` permanece inalterado. A integração de callback futura deve passar **a versão do grant consumido** para o cofre e não confiar no valor retornado pela interface. Requer CI integral no HEAD final e revisão de segurança por pessoa independente antes de merge ordenado.
