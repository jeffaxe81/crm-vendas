# Release — 30 funcionalidades integrais — 2026-11-01

## Objetivo

Congelar uma release do CRM com exatamente **30 funcionalidades integrais**, todas já presentes na base `main` em `e59c7741c225f5f1f4e6a29e9d5d2361517ed11d`.

A lista canônica está em `release-30-functionalidades-2026-11-01.json` e é validada automaticamente por `tests/release-30-functionalities.test.mjs`.

## Barra de fechamento

- [x] escopo congelado em 30 funcionalidades;
- [x] nenhuma funcionalidade externa/incompleta contabilizada;
- [x] PR #329 revalidado contra o main atual;
- [ ] gate integral da branch de release;
- [ ] varredura final de pendências abertas;
- [ ] backlog pós-release consolidado;
- [ ] aprovação pós-testes;
- [ ] integração do fechamento ao main.

## Critério de integralidade

Uma funcionalidade entra nesta release apenas quando:

1. já está integrada ao `main`;
2. possui comportamento de produção, não apenas mock ou planejamento;
3. não depende de credencial externa, domínio externo ou homologação humana para existir;
4. está coberta pelo gate automatizado aplicável;
5. preserva isolamento por organização, RBAC e auditoria quando aplicável.

## Evidência adicional

A campanha de regressão do PR #329 foi reexecutada contra o `main` atual no run `41326300372` (#2068) e concluiu GREEN. Ela adiciona 10.000 casos determinísticos, mas **não é contada como funcionalidade de produto**.

## Regra de fechamento

O fechamento técnico ocorre somente após o gate integral desta branch. O merge do PR de release continua sujeito à aprovação pós-testes do Prompt Master.
