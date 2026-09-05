# CRM Axesistemas

Fundação técnica do CRM Axesistemas construída na branch `cycle-0-foundation`.

> Status: Cycle 0 em validação. O `main` permanece preservado com o AXE Relationship legado até a nova fundação passar pelo gate completo de qualidade e recuperação.

## Pré-requisitos

- Node.js 24.20.0;
- pnpm 11.3.0 via Corepack;
- Docker Desktop no Windows, ou Docker Engine + Compose em Linux;
- Git.

No Windows, o caminho documentado usa PowerShell e Docker Desktop. WSL não é obrigatório para executar o ambiente descrito aqui.

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

Clone o repositório e entre na branch da fundação:

```powershell
git clone https://github.com/jeffaxe81/crm-vendas.git
Set-Location crm-vendas
git switch cycle-0-foundation
```

Crie o arquivo local de ambiente, sem versionar segredos:

```powershell
Copy-Item .env.example .env
```

Instale exatamente as dependências registradas no lockfile:

```powershell
pnpm install --frozen-lockfile
```

Suba somente o PostgreSQL e gere o Prisma Client:

```powershell
docker compose up -d postgres
pnpm --filter @axes/api prisma:generate
```

Execute web e API em modo de desenvolvimento:

```powershell
pnpm dev
```

Endereços locais:

- Web: `http://localhost:3000`;
- API: `http://localhost:3001/api/v1`;
- Health: `http://localhost:3001/api/v1/health`.

Para executar a pilha completa em contêineres:

```powershell
docker compose up -d --build --wait
```

O password `axes` presente no Compose existe apenas para desenvolvimento local e não deve ser reutilizado em outros ambientes.

## Validação

Gate principal:

```powershell
pnpm --filter @axes/api prisma:generate
pnpm verify
pnpm test:e2e
docker compose config --quiet
docker compose build api web
```

O Cycle 0 só pode ser considerado concluído quando esses comandos passarem em uma instalação limpa e o CI aplicar o mesmo gate.

O endpoint esperado após a inicialização é:

```json
{
  "status": "ok",
  "service": "api",
  "database": "up"
}
```

Todas as respostas da API devem carregar `x-request-id`. Erros seguem o envelope:

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "Recurso não encontrado.",
  "request_id": "crm-request-1234",
  "details": []
}
```

## Arquitetura

A fundação aprovada utiliza:

- monorepositório pnpm;
- aplicação web Next.js;
- API NestJS;
- PostgreSQL;
- Prisma;
- contratos TypeScript compartilhados;
- Docker Compose;
- logs estruturados com correlação de requisição;
- testes unitários, integração, contrato e ponta a ponta.

Estrutura principal:

```text
apps/
  api/
  web/
packages/
  contracts/
docs/
  architecture/
  decisions/
  testing/
tests/
  e2e/
compose.yaml
```

O Cycle 0 não contém entidades comerciais. Organizações, usuários, memberships, autenticação e isolamento multiempresa começam no Cycle 1.

A especificação aprovada está em `docs/architecture/2026-08-30-crm-axesistemas-design.md`. A estratégia de transição do legado está em `docs/architecture/2026-09-01-foundation-transition.md`.

## Testes

| Camada                   | Comando          | Finalidade                        |
| ------------------------ | ---------------- | --------------------------------- |
| Contratos do repositório | `pnpm test:repo` | Toolchain e Compose               |
| Unitários/integração     | `pnpm test`      | Pacotes, web, API e banco         |
| Tipos                    | `pnpm typecheck` | Contratos TypeScript              |
| Build                    | `pnpm build`     | Artefatos de produção             |
| E2E                      | `pnpm test:e2e`  | Web + API + PostgreSQL            |
| Gate agregado            | `pnpm verify`    | Formatação, tipos, testes e build |

Para o E2E local, o PostgreSQL deve estar saudável antes da execução:

```powershell
docker compose up -d postgres
pnpm --filter @axes/api prisma:generate
pnpm test:e2e
```

## Retorno

O `main` atual permanece como checkpoint operacional do AXE Relationship enquanto a nova fundação está em construção.

Depois que o gate do Cycle 0 for aprovado, a tag protegida será:

```text
v0.0.0-foundation
```

Para abrir o estado histórico após a criação da tag:

```powershell
git switch --detach v0.0.0-foundation
Copy-Item .env.example .env
docker compose up -d --build
```

Esse comando abre um estado histórico protegido. Não faça novos commits em `detached HEAD`; crie uma nova branch antes de alterar qualquer arquivo.

## Changelog

O histórico técnico da fundação está em `CHANGELOG.md`. Cada ciclo aprovado deve produzir commit identificado, migração versionada quando aplicável, testes, changelog, instrução de retorno e tag/checkpoint.
