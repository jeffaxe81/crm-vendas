# backend/ — serviço Python (congelado até o Ciclo 6)

> **Leia o [ADR-0002](../docs/decisions/ADR-0002-stack-principal-typescript.md).**
> O backend principal do CRM-VENDAS é o monorepositório TypeScript
> (`apps/api` NestJS + `apps/web` Next.js). Este diretório **não** deve
> receber regras de negócio do CRM.

## Para que serve

Base do futuro **serviço de inteligência (ML)** do Ciclo 6: scoring de
oportunidades, forecast de receita e explicabilidade (scikit-learn, XGBoost,
SHAP).

Hoje contém uma API FastAPI funcional e testada (autenticação JWT, RBAC,
health checks, migrations Alembic, 60 testes pytest com 94% de cobertura),
que serve de esqueleto. Ao integrar com o CRM, a autenticação própria deve dar
lugar à validação dos tokens emitidos pela API NestJS.

## Rodar localmente

Veja a seção do backend Python no `SETUP.md` (`docker compose -f docker-compose.yml ...`).
