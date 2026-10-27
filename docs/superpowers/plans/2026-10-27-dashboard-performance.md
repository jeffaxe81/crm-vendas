# Dashboard Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repetir medições seguras de dashboards e produzir evidência local reproduzível.
**Architecture:** Extensão opt-in do verificador GET existente, sem dependências novas.
**Tech Stack:** Node24, node:test, PostgreSQL18 e imagem local da API.
**Spec:** docs/superpowers/specs/2026-10-27-dashboard-performance-design.md

## Global Constraints

- Nenhuma mutação HTTP; nenhum banco real usado como laboratório.
- Sem domínio ou credenciais externas; preservar modo atual.
- Aquecimento0..10, amostras5..100 por empresa, concorrência1, timeout15000ms.
- Relatório sem tokens, URLs, IDs ou corpos HTTP; falha interrompe a rodada.

## Review Focus

- Entrada inválida não dispara tráfego.
- Ordem de amostras alterna empresas, sem mistura de contagens.
- Percentis excluem aquecimento e seguem nearest-rank.
- Erro/cache incorreto nunca produz aprovação parcial.
- Saída legada permanece idêntica sem opt-in.

### Task1: Medição e relatório opt-in

**Files:** scripts/dashboard-staging-smoke.mjs; tests/dashboard-staging-smoke.test.mjs.
**Interfaces:** runDashboardStagingSmoke(config, fetchImpl=fetch, now=performance.now) preserva resultado legado; performance opcional acrescenta relatório sanitizado.

- [ ] Adicionar testes determinísticos dos cinco focos e observar RED.
- [ ] Validar performance antes de GET e medir leituras round-robin; calcular estatísticas.
- [ ] Acrescentar entrada CLI opcional e saída JSON apenas no modo de medição.
- [ ] Verificar node--test e formatação, atualizar guia operacional e commitar.

### Task2: Homologação sintética e revisão

**Files:** docs/checkpoints/2026-10-27-dashboard-performance.md.

- [ ] Preparar laboratório separado com papel RLS restrito, três sessões e100/1000/10000 empresas.
- [ ] Rodar smoke com aquecimento2 e30 amostras por empresa; registrar metodologia e evidência sanitizada.
- [ ] Revisão independente, CI no PR e integração somente após sucesso.
