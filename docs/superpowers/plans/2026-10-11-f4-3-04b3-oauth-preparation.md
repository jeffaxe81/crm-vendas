# F4.3-04B3 — pré-conexão OAuth segura e callback inativo

**Dependências:** PR #136 integrada à main; PR #137 ainda exige revisão independente antes de integração. Esta PR é incremental e depende do armazenamento de estado da #137.

## O que muda

- `EmailOAuthPreparationService` compõe a intenção PKCE com o armazenamento cifrado da #137, exige **sessão de usuário ativa** (não credencial de API), administrador ativo e preferência de provedor correta para a empresa.
- `EmailOAuthClientResolver` é uma interface de configuração **interna, confiável e por organização**; jamais aceita ID de cliente OAuth, tenant Azure ou URI de redirecionamento vindo da requisição.
- Se não houver configuração para aquela empresa/provedor, falha fechado. O método só retorna `authorizationUrl`, validade e estados de conexão/envio explicitamente desativados; não devolve `codeVerifier`, organização ou IDs internos.
- Uma rota `GET /admin/email/oauth/callback` na aplicação web faz apenas **303 para uma URL fixa e limpa**, com no-store e no-referrer. Não retorna nem registra códigos, `state` ou erros recebidos na query.
- Testes unitários da composição e testes da rota de callback, todos sem rede.

## O que **não** está conectado

A classe `EmailOAuthPreparationService` não é exportada por `EmailModule` e não há endpoint `Connect`. O resolver ainda não possui um adaptador de configuração em produção. A landing route descarta códigos; sua existência não significa OAuth funcional. `DisabledEmailProvider` permanece.

## Gates para ativar uma conexão real

1. Salvar configuração por empresa/provedor com client registration validado e URI exata registrada no Google/Entra, sem segredos no frontend.
2. Tornar início HTTP administrado, com limites de tentativas e política de cookies/sessão. Validar proteção CSRF além de `state` e a vinculação ao navegador/sessão, inclusive durante retorno por redirecionamento.
3. Substituir a rota de descarte pelo tratamento de callback autenticado, rejeitando duplicações, replay, troca de empresa, código expirado e issuer incorreto. Confirmar identidade real, assinatura do ID token, audience, token binding e remetente autorizado. Só então trocar o código por tokens e gravar refresh tokens cifrados.
4. Adicionar `Disconnect`, revogação, auditoria segura, testes homologados e um gate operacional explícito antes de qualquer envio; **não usar status 202 ou aceitação como prova de entrega**.
5. Incorporar análise de segurança independente e revisão de proteção de dados antes do merge.

Google oficial: https://developers.google.com/identity/protocols/oauth2/web-server

Microsoft oficial: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
