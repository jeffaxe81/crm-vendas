# Verificação em banco real — Territory Management (C4.1.6)

Data: 26/09/2026
Contexto: complementa `produtividade-phase-2-2026-09-26-ampliada.md`. O `prisma generate`/`migrate` seguiu bloqueado neste sandbox (o binário do schema-engine é buscado do zero em `binaries.prisma.sh`, sem fallback via npm), mas foi possível instalar um **PostgreSQL 16 real** localmente (`archive.ubuntu.com` está liberado) e validar o schema diretamente, sem depender do Prisma Client.

## O que foi feito

1. PostgreSQL 16 instalado e iniciado localmente.
2. Roles criadas seguindo exatamente `postgres-init/01-create-app-role.sh` (role owner `axes` para migrations, role restrita `axes_app`, sem `BYPASSRLS`, para o app).
3. **Todas as 17 migrations do repositório aplicadas em ordem via `psql`**, incluindo a nova `20260926200000_c4_1_6_territory_management` — todas OK, sem erros de sintaxe ou de dependência.
4. Testes funcionais diretos em SQL, como a role restrita (`axes_app`), simulando exatamente o que a aplicação faz via `withTenant`.

## Resultados

| Verificação | Resultado |
| --- | --- |
| As 17 migrations aplicam em sequência sem erro | ✅ |
| Isolamento RLS por tenant (`SELECT` só retorna linhas da organização no `app.current_organization_id`) | ✅ confirmado com 2 organizações e 2 territórios |
| RLS bloqueia `INSERT` cruzado (tentar inserir território de uma org estando no contexto de outra) | ✅ rejeitado com `new row violates row-level security policy` |
| FK composta impede vincular cobertura a uma empresa de outra organização | ✅ rejeitado com `violates foreign key constraint "territory_targets_company_org_fkey"` |
| Upsert de cota por `(territory_id, period, year)` — o padrão real que o Prisma gera (`ON CONFLICT` por lista de colunas, não por nome de constraint) | ✅ funciona corretamente contra o índice único |

### Nota sobre o teste de upsert

Na primeira tentativa, testei manualmente `ON CONFLICT ON CONSTRAINT territory_quotas_territory_period_year_key` e ele falhou, porque essa chave foi criada como **índice único** (`CREATE UNIQUE INDEX`), não como constraint nomeada. Isso pareceu, a princípio, um bug real na migration. Investigando, confirmei que o Prisma **não** usa `ON CONFLICT ON CONSTRAINT` em upserts nativos no Postgres — ele gera `ON CONFLICT (coluna1, coluna2, coluna3) DO UPDATE ...`, que testei separadamente e funciona sem problema contra o índice único. Ou seja: **não é um bug**, era um erro no meu teste manual, não no schema. Registro isso aqui para transparência do processo, não porque haja algo a corrigir.

## O que isso NÃO substitui

- A suíte de testes de integração real (`territories.integration.spec.ts`, `sales-by-owner.integration.spec.ts`, `sales-by-month.integration.spec.ts`) continua **não executada** — ela testa a API HTTP completa (auth, guards, serialização, auditoria), não só o schema SQL. Precisa do Prisma Client gerado, que segue bloqueado aqui.
- `prisma migrate dev`/`deploy` de verdade (o que valida se o Prisma reconhece a migration como aplicada corretamente no seu histórico `_prisma_migrations`) não foi testado — apliquei via `psql` bruto.

## Conclusão

O schema e as regras de segurança (RLS + FKs compostas) da Territory Management estão **funcionalmente corretas em um banco Postgres real**, não apenas plausíveis no papel. O que falta para fechar 100% é rodar a suíte Jest de integração com o Prisma Client de verdade, em um ambiente com acesso a `binaries.prisma.sh` — isso ainda depende de você.
