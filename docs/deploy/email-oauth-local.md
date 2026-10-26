# OAuth local para Gmail e Microsoft365

O acesso continua em `http://127.0.0.1:3000`. Não é necessário reservar um domínio para preparar a conexão local. O callback registrado nos aplicativos deve ser exatamente `http://127.0.0.1:3000/admin/email/oauth/callback`. O provedor precisa aceitar esse callback na configuração do aplicativo; a existência do fluxo local não comprova autorização real do provedor.

Configuração privada da API:

- `EMAIL_OAUTH_ALLOW_LOOPBACK=true` libera somente origens HTTP localhost/127.0.0.1/::1, fixadas ao valor exato de `EMAIL_OAUTH_CALLBACK_ORIGIN`, incluindo porta.
- `EMAIL_OAUTH_CALLBACK_ORIGIN=http://127.0.0.1:3000`.
- `EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON` contém `{"version":1,"registrations":[{"provider":"GMAIL","organizationId":"UUID_DA_EMPRESA","clientId":"ID_DO_APLICATIVO"}]}`. Microsoft365 usa provider `MICROSOFT_365`, clientId UUID e microsoftTenantId UUID específico da organização.
- `EMAIL_OAUTH_CLIENT_SECRETS_JSON` associa `UUID_DA_EMPRESA:GMAIL` ou `UUID_DA_EMPRESA:MICROSOFT_365` ao segredo do aplicativo. Nunca cadastrar segredos em Git ou no chat.
- `EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY` e `EMAIL_OAUTH_PENDING_ENCRYPTION_KEY` são chaves base64 canônicas de32bytes, geradas separadamente e persistidas no mecanismo privado do ambiente. Não reutilizar a chave de backup.

Sem aplicativos ou chaves, a interface informa configuração pendente. O administrador escolhe o provedor da empresa e usa Conectar conta. A janela do provedor retorna o código à aba autenticada original; a URL é limpa imediatamente e o callback não é armazenado no navegador. Estado, PKCE, nonce, empresa, sessão e revisões do provedor/credencial são validados antes de guardar o refresh token criptografado. A consulta de status não expõe token nem identidade externa.

Desconectar remove a credencial local e invalida intenções pendentes; a revogação de consentimento externo é feita nas configurações da conta no provedor. Refreshes são serializados e tokens revogados são removidos localmente. O worker verifica novamente estado/lease e aguarda o lock de manutenção antes do envio; recuperação pausa mensagens antigas para revisão manual.

O transporte da aplicação permanece ligado a `DisabledEmailProvider`, inclusive se houver variáveis antigas de ativação no ambiente. Os adaptadores Gmail/Graph são cobertos por simuladores; ativar envio real exige uma entrega específica após homologação com contas de teste e credenciais reais. Conectar uma conta ou alterar a preferência não ativa envios.

Domínio HTTPS externo continua adiado. Não há envio real nem certificação de produção nesta entrega. Testes destrutivos de recuperação usam exclusivamente banco sintético.
