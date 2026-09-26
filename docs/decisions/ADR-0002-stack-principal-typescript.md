# ADR-0002 — Stack principal: monorepositório TypeScript (NestJS + Next.js)

**Status:** Aceito
**Data:** 23 de setembro de 2026
**Substitui parcialmente:** a stack "FastAPI + React/Zustand" citada no README e no `MASTER_TIMELINE_CYCLES_3-6.md`

## Contexto

Em setembro de 2026 o repositório passou a ter **duas implementações de backend concorrentes**:

|                   | Monorepo TypeScript (`apps/`, `packages/`)                                                                                                                                                                 | Backend FastAPI (`backend/`)                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Decisão de origem | ADR-0001 (30/08/2026)                                                                                                                                                                                      | Plano de ciclos (README / Master Timeline)                   |
| API               | NestJS + Prisma + PostgreSQL com RLS                                                                                                                                                                       | FastAPI + SQLAlchemy + Alembic                               |
| Web               | Next.js                                                                                                                                                                                                    | inexistente (`frontend/` só tem Dockerfile)                  |
| Funcionalidades   | identidade e acesso, RBAC, isolamento multiempresa com RLS, empresas, contatos, tags, campos customizados, pipelines e etapas, oportunidades, atividades, auditoria, importação CSV, relatórios gerenciais | registro, login, refresh, reset de senha, `/me`, RBAC básico |
| Migrations        | 15 (Prisma)                                                                                                                                                                                                | 2 (Alembic)                                                  |
| Testes            | 36 suítes de teste na API, 25 testes de contratos, 41 testes web, E2E Playwright e CI                                                                                                                      | 60 testes pytest                                             |
| Tamanho           | cerca de 24 mil linhas escritas à mão (sem código gerado)                                                                                                                                                  | cerca de 1,5 mil linhas                                      |

Seguir com as duas duplica esforço, confunde o time sobre onde implementar cada história e exigiria reescrever em Python os Ciclos 3 e 4, que já existem em TypeScript.

## Decisão

1. **O monorepositório TypeScript (`apps/api` NestJS, `apps/web` Next.js, `packages/contracts`) é a stack principal do CRM-VENDAS.** Todas as histórias de produto (Ciclos 4, 5 e seguintes) são implementadas nele.
2. **O `backend/` FastAPI deixa de ser o backend do CRM** e fica **congelado**. Ele será reaproveitado no **Ciclo 6** como base do **serviço de inteligência (ML)**: scoring de oportunidades, forecast e explicabilidade (scikit-learn, XGBoost, SHAP), onde Python é de fato necessário.
   - Nenhuma nova regra de negócio de CRM (empresas, contatos, oportunidades etc.) deve ser escrita no `backend/`.
   - A autenticação própria do `backend/` será substituída pela validação dos tokens emitidos pela API NestJS quando o serviço de ML for integrado.
3. **O legado `client/` + `server/` + `drizzle/` (Vite/Express/tRPC/Drizzle)** continua como referência histórica, como já prevê o ADR-0001, e não recebe evolução.

## Motivos

- **Tempo:** a stack TypeScript já entrega o escopo dos Ciclos 3 e 4. Recomeçar em FastAPI custaria vários meses de retrabalho sem ganho funcional.
- **Qualidade já comprovada:** RLS por tenant, RBAC por permissões, auditoria, gates de CI e E2E já existem e foram validados.
- **Coerência com o ADR-0001**, decisão aceita antes do plano FastAPI.
- **Python onde agrega:** o ecossistema de ML continua em Python, isolado num serviço próprio.

## Consequências

- O ambiente de desenvolvimento principal passa a ser o do `compose.yaml` com pnpm (ver README do monorepo e `apps/`). O `docker-compose.yml` passa a servir apenas ao serviço Python.
- O backlog de GitHub da "Sprint 1 / Ciclo 3" escrito para FastAPI precisa ser **remapeado**: histórias já atendidas pelo monorepo TS devem ser fechadas com referência ao código existente; as demais, reescritas para NestJS/Next.js.
- Os documentos de planejamento (README, `MASTER_TIMELINE_CYCLES_3-6.md`, arquiteturas de ciclo) que citam FastAPI como API principal devem ser lidos à luz deste ADR até serem revisados.
- O orçamento e a contratação devem priorizar **TypeScript/Node (NestJS, Next.js, Prisma)**. O perfil Python fica concentrado em dados/ML a partir do Ciclo 6.

## Alternativas rejeitadas

- **Migrar tudo para FastAPI:** reescrita de funcionalidades prontas e testadas; maior prazo e maior risco.
- **Manter as duas stacks em paralelo para o CRM:** duplicação de regras de negócio, de auth e de modelo de dados.
- **Apagar o `backend/` agora:** descartaria uma base funcional e testada que será útil para o serviço de ML.

## Changelog

- 2026-09-23 — criação do ADR.
