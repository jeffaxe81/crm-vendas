# AXE CRM — Checkpoint do Ciclo 4: atividades, agenda e follow-ups

**Data:** 2026-11-02. **Escopo:** Ciclo 4 de produtividade comercial (ACT-001/002/003). **PR:** #333.

## Referência de engenharia

- Baseline: `main@ce0780dacb89dd5656a64dfee9eacfcdc21848c2` (após PR #332).
- ACT-001 — Atividades e tarefas: já existia na base, com titular, prioridade, prazo, vínculos, ciclo de vida e auditoria.
- ACT-002 — Agenda comercial: já existia na base com Semana/Hoje/Atrasadas e filtros por responsável, status, prioridade e prazo.
- ACT-003 — Follow-up: adiciona tipo explícito `FOLLOW_UP` sem criar endpoint ou domínio paralelo.

## Entrega técnica no PR #333

1. `ActivityTypeSchema` e `ActivityType` no Prisma aceitam `FOLLOW_UP`; migration PostgreSQL aditiva e versionada `20261102121500_c4_activity_follow_up`.
2. API atual de atividades aceita criação, consulta, atualização e filtro de tipo, com os controles multiempresa/RLS preexistentes.
3. Tela de Atividades: opção de criação, rótulo e filtro local por tipo, combinado aos filtros de prioridade e atraso.
4. Agenda Comercial: rótulo e filtro `FOLLOW_UP` usando o parâmetro existente de API, também na visão de atividades vencidas.
5. Compatibilidade com exportação ICS e textos de interface em PT-BR, EN e ES.
6. Testes: contratos, integração API e testes Web de criação, atualização, visualização e filtros.

## Regras e limites preservados

- `OVERDUE` permanece derivado de `PENDING` com `dueAt` no passado; não é persistido.
- O filtro de tipo da tela Atividades opera sobre a lista carregada (não substitui paginação ou pesquisa server-side).
- Sem bypass de RLS, novas permissões, dependências externas, notificação automática, disparos de e-mail ou IA.
- Este checkpoint não comprova implantação ou homologação em servidor real.

## Evidência e gate

- Primeira execução integral após implementação: [workflow 41447541873](https://github.com/jeffaxe81/crm-vendas/actions/runs/41447541873), **SUCCESS**, no SHA `890a599b2ee205483eb532a1a120b69ef858abfe`.
- Ao adicionar este checkpoint e release notes, o HEAD muda. **Validar novamente o gate completo no SHA final antes de realizar merge** e registrar o SHA efetivo na PR.
- Homologação operacional e eventual deploy permanecem decisões separadas.

## Próxima ação

Validar CI do último commit, revisar mudanças, deixar a PR pronta e integrar à `main` somente com status verde e autorização.
