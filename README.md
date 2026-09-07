# CRM Axesistemas

CRM modular da Axesistemas, com fundação Next.js + NestJS + PostgreSQL + Prisma e arquitetura preparada para múltiplas organizações.

O último checkpoint aprovado e integrado é `v0.1.0-identity-access`. O Cycle 2 adiciona o núcleo funcional de relacionamento: empresas, contatos, canais, vínculos empresa–contato, histórico, tags e campos customizáveis. O checkpoint `v0.2.0-crm-core` somente será criado após o gate integral verde e a aprovação pós-testes.

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

## CRM Core — Cycle 2

O Cycle 2 implementa o primeiro núcleo de negócio do CRM:

- cadastro, busca, edição e soft delete de empresas;
- cadastro de contatos independentes de empresa;
- múltiplos canais por contato, com canal principal por tipo;
- vínculo e desvínculo empresa–contato;
- histórico de relacionamento associado a empresa, contato ou ambos;
- tags por organização, com vínculo a empresas e contatos;
- campos customizáveis com escopo `COMPANY` ou `CONTACT`;
- App Shell autenticado com navegação entre Empresas e Contatos;
- restauração de sessão após reload usando refresh cookie HttpOnly;
- proteção contra rotação duplicada do refresh token em React Strict Mode.

Toda consulta e mutação de entidades do CRM é derivada da organização autenticada. Identificadores de outra organização devem resultar em recurso não encontrado, sem permitir leitura ou alteração cruzada.

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

Nenhum ciclo pode ser aprovado enquanto formatação, lint, typecheck, testes unitários e de integração, E2E, migrations, Compose e imagens Docker não passarem no mesmo commit.

O E2E do Cycle 2 cobre login, criação de empresa, criação de contato independente, canal de e-mail, vínculo empresa–contato, histórico, reload e verificação dos dados persistidos após restauração da sessão.

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
- auditoria append-only;
- entidades CRM com `organizationId` e validação de escopo no serviço.

A organização ativa é derivada da sessão autenticada. Endpoints administrativos e de negócio não aceitam `organization_id` livre da interface para decidir o escopo da consulta.

Documentos principais:

- `docs/architecture/2026-08-30-crm-axesistemas-design.md`;
- `docs/architecture/foundation.md`;
- `docs/architecture/2026-09-01-cycle-1-identity-access.md`;
- `docs/superpowers/specs/2026-09-06-cycle-2-crm-core-design.md`;
- `docs/superpowers/plans/2026-09-06-cycle-2-crm-core.md`;
- `docs/decisions/ADR-0001-foundation.md`.

## Testes

A suíte cobre, entre outros pontos:

- login e credenciais inválidas;
- cookie de refresh protegido;
- rotação e detecção de reutilização de refresh token;
- restauração de sessão sem rotação duplicada em Strict Mode;
- logout e revogação imediata da sessão;
- usuário e membership desativados;
- isolamento de leitura e mutação entre organizações;
- bloqueio de escrita para perfil `VIEWER`;
- validação de ambos os lados do vínculo empresa–contato;
- rejeição de histórico com entidade excluída ou de outra organização;
- isolamento de tags e campos customizados;
- auditoria append-only sem senha ou hash do refresh token;
- migração reproduzível;
- jornada E2E completa do CRM Core com persistência após reload.

Comandos principais:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm verify
```

## Retorno

O último checkpoint aprovado anterior ao Cycle 2 é:

```text
v0.1.0-identity-access
```

Para abrir esse estado histórico sem alterar branches:

```powershell
git switch --detach v0.1.0-identity-access
Copy-Item .env.example .env
```

Depois, gere o Prisma e suba os serviços conforme as instruções daquela versão. Não faça commits em `detached HEAD`; crie uma nova branch se precisar modificar o estado histórico.

Enquanto o Cycle 2 não tiver aprovação pós-testes, `v0.1.0-identity-access` permanece o ponto de rollback. O futuro checkpoint `v0.2.0-crm-core` não deve ser criado, movido ou substituído antes do gate final aprovado. Tags já aprovadas nunca devem ser removidas ou reposicionadas.

## Changelog

O histórico de ciclos, checkpoints e mudanças relevantes está em `CHANGELOG.md`. Cada ciclo aprovado deve manter migration versionada quando aplicável, evidências de testes, instrução de retorno e tag/checkpoint recuperável.
