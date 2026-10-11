# F4.3-05B7 — proteção de versão na etapa final OAuth

## Risco fechado

F4.3-05B6 impede o consumo de um estado OAuth depois da mudança da preferência de provedor. Ainda havia uma janela entre esse consumo, a validação OIDC/troca de token em rede e a gravação do refresh token cifrado no cofre. A preferência poderia mudar nessa janela e voltar ao código original, permitindo armazenar credencial antiga.

## Implementação

- O consumo do estado devolve `providerPreferenceVersion` ao servidor junto ao verificador PKCE e nonce, sem exposição ao navegador.
- O cofre recebe `expectedProviderPreferenceVersion` obrigatória (inteiro positivo), derivada do estado consumido, e compara com a preferência atual dentro de transação RLS, bloqueando a preferência com `FOR UPDATE` até concluir a gravação.
- A coluna `email_oauth_credentials.provider_preference_version` preserva a versão durante inserções e rotações. Migração acrescenta coluna nula inicialmente: credenciais legadas sem versão ficam indisponíveis e devem ser renovadas após verificação.
- A consulta de status continua apenas de metadados, sem descriptografar tokens; agora retorna `NOT_CONNECTED` e `hasEncryptedCredential=false` quando código/versão não coincidem, mesmo havendo ciphertext histórico. O número da versão do cofre é mantido para permitir renovação controlada.
- Testes PostgreSQL/RLS demonstram que alternar Gmail → Microsoft 365 → Gmail não recupera um grant, que salvar novamente Gmail invalida uma credencial antiga e que legados sem versão falham fechado.

## Limites operacionais

A alteração é **offline**: sem controller de conexão, sem OAuth em produção, sem envio real e sem exposição de senhas ou refresh tokens. O `EmailModule` continua com `DisabledEmailProvider`. O código depende da cadeia de PRs OAuth até F4.3-05B6 (#158). Revisão humana e CI são obrigatórios antes de integrar a `main`.

## Verificação de segurança adicional

Uma preferência de provedor alterada deve tornar uma credencial previamente cifrada indisponível em consultas de status; apenas nova verificação OIDC e gravação com a versão corrente poderá atualizar o cofre. Uma conta antiga permanece armazenada somente para revogação/limpeza local, nunca para disparo de mensagens.
