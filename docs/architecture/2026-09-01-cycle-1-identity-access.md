# Ciclo 1 — Identidade, acesso, multiempresa e auditoria

**Base:** `v0.0.0-foundation`  
**Branch:** `cycle-1-identity-access`  
**Escopo:** SEC-001, SEC-002, SEC-003, SEC-004 e AUD-001.

## Objetivo

Entregar a primeira camada funcional de identidade e segurança do CRM Axesistemas, mantendo o usuário global, a organização ativa na sessão e isolamento obrigatório por organização.

## Princípios do ciclo

- nenhuma consulta de negócio confiará em `organization_id` enviado livremente pela tela;
- usuário é global; acesso a uma organização depende de membership ativo;
- perfis do MVP são fixos em código: Administrador, Gestor, Vendedor e Consulta;
- permissões são ações explícitas, não apenas nomes de perfil;
- refresh token será rotacionável, revogável e persistido somente por hash;
- auditoria é append-only para a aplicação comum;
- testes adversariais tentarão cruzar organizações;
- o `main` permanece preservado até novo checkpoint aprovado.

## Blocos de execução

### 1. Modelo de identidade e migração

Entidades:

- `organizations`;
- `users`;
- `organization_memberships`;
- `refresh_sessions`;
- `audit_logs`.

Critérios:

- UUID em todas as chaves;
- e-mail global normalizado e único;
- membership único por usuário e organização;
- role fixa por membership;
- sessões ligadas ao usuário e à organização;
- índices por organização e data na auditoria;
- primeira migração versionada do Ciclo 1.

### 2. Autenticação e sessão

Entregas:

- hashing Argon2id;
- login com mensagem neutra;
- JWT de curta duração;
- refresh token opaco rotacionável;
- refresh token em cookie HttpOnly;
- logout com revogação;
- invalidação quando usuário, organização ou membership estiverem inativos.

### 3. Contexto de organização

Entregas:

- organization ativa derivada da sessão;
- decorator/contexto tipado para usuário e organização;
- proteção contra troca arbitrária de organização;
- testes de isolamento entre duas organizações.

### 4. Perfis e permissões

Perfis:

- Administrador;
- Gestor;
- Vendedor;
- Consulta.

Entregas:

- mapa fixo de permissões em código;
- guard de autenticação;
- guard de permissão;
- verificação de membership ativo;
- base preparada para regras de propriedade do Vendedor.

### 5. Auditoria

Entregas:

- serviço append-only;
- organização, usuário, ação, entidade, request_id e IP quando disponível;
- before/after somente para campos permitidos;
- endpoint administrativo de consulta paginada;
- permissão `audit.read`.

## Critérios de aceite do Ciclo 1

1. usuário válido consegue autenticar;
2. sessão pode ser renovada com rotação do refresh token;
3. logout revoga a sessão;
4. usuário desativado não autentica nem renova;
5. membership inativo bloqueia acesso à organização;
6. token de uma organização não permite acessar outra organização;
7. permissões impedem operação não autorizada;
8. auditoria registra ações críticas sem segredos;
9. migração é versionada e reproduzível;
10. lint, typecheck, testes, E2E, Compose e Docker ficam verdes no mesmo checkpoint.

## Retorno

O retorno seguro deste ciclo é a tag:

`v0.0.0-foundation`

Nenhum rollback do Ciclo 1 deve remover ou alterar essa tag.
