# F4.3-04B1 — autorização OAuth (biblioteca offline)

Dependência: issue #135; seleção de provedor por empresa entregue em #134.

## Entregue neste incremento

- Gerador de intenção de autorização para **Gmail / Google Workspace** e **Microsoft 365 / Outlook**, com authorities fixas e Microsoft tenant específico.
- OAuth Authorization Code + PKCE S256; `state` aleatório de alta entropia. O registro privado conserva apenas SHA-256 de `state` e o verificador PKCE.
- `redirectUri` HTTPS com caminho exato `/admin/email/oauth/callback`, sem porta extra, parâmetros, credenciais ou fragmento. Deve vir exclusivamente de configuração confiável do servidor.
- Contexto `organizationId` e `actorUserId` no registro pendente do servidor, nunca na URL de autorização.
- Tempo de validade pretendido de 5 minutos, para o armazenamento transacional futuro.
- Testes unitários offline cobrindo provedores, parâmetros, entropia, isolamento contextual e rejeição de configurações inseguras.

## Não entregue — gates ainda obrigatórios

**Esta biblioteca isolada não torna o fluxo OAuth seguro de ponta a ponta**. Antes de expor `Connect`/callback, implementar, revisar e testar:

1. Tabela de tentativas pendentes com `ENABLE/FORCE RLS`, restrição por empresa/usuário, armazenamento **criptografado** do verificador PKCE e consumo atômico de uso único até 5 minutos. Estado de conexão inicialmente `DISABLED`.
2. Endpoint de início somente para administrador autenticado, associado à preferência selecionada daquela organização. Nunca confiar em `organizationId`, `clientId`, tenant Microsoft ou `redirectUri` fornecidos pelo navegador.
3. Callback HTTPS com correspondência de `stateHash`, bloqueio de replay, verificação estrita de `issuer`, `audience`, `nonce` (se usar ID token), `tid`/`oid` Microsoft e identidade real da conta remetente Google. Só então trocar código por token. Cifrar refresh token por empresa, revogar/rotacionar e auditar sem segredos.
4. Testes de falhas CSRF, replay, tenant trocado, corridas, revogação, expiração, autorização de remetente e falhas do provedor.
5. Adapters de envio e homologação específicos, observando limites e aceitação ambígua; não permitir retentativa cega. Nenhum `202` significa entrega comprovada.

## Política de segurança mantida

`EmailModule` não importa esta biblioteca e preserva `{ provide: EMAIL_PROVIDER, useClass: DisabledEmailProvider }`. Nenhum endpoint, segredo, banco, chamada de rede, consentimento real ou envio é adicionado neste incremento. Somente CI verde + revisão de segurança independente permitem integrar à `main`. Seleção de provedor **não** ativa comunicação externa.

Referências: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Microsoft identity OAuth PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
