# CRM Axesistemas

CRM modular da Axesistemas, com fundação Next.js + NestJS + PostgreSQL + Prisma e evolução preparada para múltiplas organizações.

O checkpoint aprovado da fundação é `v0.0.0-foundation`. O Ciclo 1 adiciona identidade, autenticação, organização ativa, RBAC, administração de usuários e auditoria append-only.

## Pré-requisitos

- Node.js 24.20.0;
- pnpm 11.3.0 via Corepack;
- Docker Desktop no Windows, ou Docker Engine + Compose em Linux;
- Git.

Confirme as versões:

```powershell
node --version
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm --version
docker --version
docker compose version
```

## Inicialização

Clone o repositório e selecione a branch/ciclo que deseja validar:

```powershell
git clone https://github.com/jeffaxe81/crm-vendas.git
Set-Location crm-vendas
```

Crie o arquivo local de ambiente:

```powershell
Copy-Item .env.example .env
```

Antes de qualquer uso real, substitua `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER` e a senha de bootstrap por valores fortes e exclusivos. Segredos não devem ser commitados.

Instale as dependências congeladas, suba o PostgreSQL e prepare o Prisma:

```powershell
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm --filter @axes/api prisma:generate
pnpm --filter @axes/api prisma:migrate:deploy
```

Para criar ou atualizar explicitamente a primeira organização e o primeiro administrador, preencha as variáveis `BOOTSTRAP_*` no `.env` e execute:

```powershell
pnpm --filter @axes/api bootstrap:admin
```

Execute Web e API em desenvolvimento:

```powershell
pnpm dev
```

Endereços locais:

- Web: `http://localhost:3000`;
- API: `http://localhost:3001/api/v1`;
- Health: `http://localhost:3001/api/v1/health`.

Para a pilha completa em contêineres, defina os segredos no `.env` e execute:

```powershell
docker compose up -d --build --wait
```

A senha `axes` do PostgreSQL no Compose é apenas para desenvolvimento local e não deve ser reutilizada em outros ambientes.

## Validação

O gate técnico do ciclo executa, no mesmo checkpoint:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @axes/api prisma:generate
pnpm --filter @axes/api prisma:migrate:deploy
pnpm verify
pnpm --filter @axes/api bootstrap:admin
pnpm exec playwright install chromium
pnpm test:e2e
docker compose config --quiet
docker compose build api web
```

O Ciclo 1 só pode ser aprovado depois de lint/formatação, typecheck, testes unitários e de integração, E2E, migration, Compose e imagens Docker passarem no mesmo commit.

## Arquitetura

A solução utiliza:

- monorepositório pnpm;
- Next.js para a aplicação Web;
- NestJS para a API REST;
- PostgreSQL 18;
- Prisma;
- contratos TypeScript compartilhados;
- Docker Compose;
- logs estruturados e `x-request-id`;
- autenticação com Argon2id, JWT curto e refresh token opaco rotacionável;
- usuário global com membership por organização;
- perfis fixos `ADMIN`, `MANAGER`, `SELLER` e `VIEWER`;
- autorização por permissões explícitas;
- auditoria append-only.

A organização ativa é derivada da sessão autenticada. Endpoints administrativos não aceitam `organization_id` livre da interface para decidir o escopo da consulta.

Documentos principais:

- `docs/architecture/2026-08-30-crm-axesistemas-design.md`;
- `docs/architecture/foundation.md`;
- `docs/architecture/2026-09-01-cycle-1-identity-access.md`;
- `docs/decisions/ADR-0001-foundation.md`.

## Testes

A suíte cobre, entre outros pontos:

- login e credenciais inválidas;
- cookie de refresh protegido;
- rotação e detecção de reutilização de refresh token;
- logout e revogação imediata da sessão;
- usuário e membership desativados;
- isolamento de leitura e mutação entre organizações;
- bloqueio de ações administrativas por perfil sem permissão;
- auditoria append-only sem senha ou hash do refresh token;
- migração reproduzível;
- jornada E2E de login e logout pela Web.

Comandos principais:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm verify
```

## Retorno

O checkpoint conhecido e aprovado anterior ao Ciclo 1 é:

```text
v0.0.0-foundation
```

Para abrir esse estado histórico sem alterar branches:

```powershell
git switch --detach v0.0.0-foundation
Copy-Item .env.example .env
```

Depois, gere o Prisma e suba os serviços conforme as instruções daquela versão. Não faça commits em `detached HEAD`; crie uma nova branch se precisar modificar o estado histórico.

O checkpoint do Ciclo 1 só será criado depois do gate integral verde. Nenhum rollback deve remover ou mover tags já aprovadas.

## Changelog

O histórico de ciclos, checkpoints e mudanças relevantes está em `CHANGELOG.md`. Cada ciclo aprovado deve manter migration versionada quando aplicável, evidências de testes, instrução de retorno e tag/checkpoint recuperável.
