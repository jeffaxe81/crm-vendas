# Dashboard Gate 0 UX Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar evidências locais/CI de UX do dashboard para reduzir a pendência da issue #255 sem representar homologação real de staging.

**Architecture:** Reutilizar o Playwright existente e a interface real do CRM. Os testes criarão somente tenants sintéticos, usarão a sessão humana existente, validarão desktop/mobile, navegação por teclado, PT-BR/EN/ES e troca de sessão sem reapresentar dados do tenant anterior. Nenhum guard, RLS, schema, endpoint ou regra de negócio será relaxado.

**Tech Stack:** Playwright, Next.js 16, React 19, TypeScript, PostgreSQL 18, GitHub Actions.

**Spec:** `docs/checkpoints/2026-10-22-dashboard-gate0-readiness.md`

## Global Constraints

- Não usar produção, dados reais ou tokens permanentes.
- Não marcar staging/HTTPS/ingress, leitor de tela humano, jurídico, break-glass ou GO como concluídos.
- Reutilizar `Cache-Control: private, no-store`, RLS e guards existentes.
- Criar somente evidência automatizada reproduzível e documentação.
- Branch isolada a partir de `main@fb47dd5ef2932440290c7c18d809413e3b6df50f`.

## Review Focus

- viewport mobile não pode tornar a navegação inacessível;
- navegação por teclado deve preservar skip-link, foco e Escape no drawer;
- PT-BR/EN/ES devem renderizar o dashboard com `document.lang` correspondente;
- troca de sessão não pode exibir nome/contagem do tenant anterior;
- a evidência automatizada não pode ser descrita como homologação real ou aprovação humana.

---

### Task 1: Matriz E2E de viewport e teclado

**Files:**

- Create: `tests/e2e/dashboard-gate0-ux.spec.ts`

- [ ] Criar teste desktop que abre Resumo gerencial/Volume de dados e verifica região, refresh e largura útil sem overflow horizontal do documento.
- [ ] Criar teste mobile (390x844) que abre o drawer, verifica diálogo de navegação, foco inicial no botão de fechar, fecha com Escape e confirma retorno de foco ao gatilho.
- [ ] Exercitar skip-link por teclado e confirmar foco no `#crm-content`.
- [ ] Rodar `pnpm test:e2e -- dashboard-gate0-ux.spec.ts` e registrar o primeiro RED ou GREEN de evidência.

### Task 2: i18n e isolamento visual entre sessões

**Files:**

- Modify: `tests/e2e/dashboard-gate0-ux.spec.ts`

- [ ] Criar tenants sintéticos A/B com volumes diferentes.
- [ ] Validar PT-BR, EN e ES usando a configuração persistida de idioma e os rótulos reais do dashboard.
- [ ] Trocar sessão A → logout → B e confirmar que a organização/contagem A não reaparece enquanto B carrega.
- [ ] Manter a verificação existente de refresh/CSV como referência, sem duplicar download já coberto por `dashboard-volume.spec.ts`.

### Task 3: Evidência e gate final

**Files:**

- Create: `docs/checkpoints/2026-10-28-dashboard-ux-gate0-automation.md`
- Modify: `docs/deploy/dashboard-staging-read-only-check.md`

- [ ] Registrar comandos, SHA, cenários cobertos e limitações.
- [ ] Marcar como pendentes: staging 3 tenants, ingress/HTTPS no-store, leitor de tela humano, retenção/privacidade, break-glass/MFA e janela de implantação.
- [ ] Rodar gate completo do repositório no mesmo SHA.
- [ ] Fazer revisão final do diff; corrigir P1/P2 antes de integração.
- [ ] Atualizar a issue #255 somente com evidência automatizada, sem fechá-la.
