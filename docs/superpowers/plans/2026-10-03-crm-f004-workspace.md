# CRM-F004 — Workspace personalizável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar navegação agrupada, Administração e início configurável com preferências por usuário/organização no servidor.

**Architecture:** Contratos compartilhados definem destinos e layouts versionados. Um módulo NestJS persiste preferências com RLS e filtro de usuário; o frontend usa um catálogo de navegação e um provider de preferências. Componentes existentes de agenda, dashboard e atendimento são reutilizados sem perder o iframe de comunicação.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, Next.js/React, Zod, Vitest/Jest e Playwright; dependências existentes.

**Spec:** `docs/superpowers/specs/2026-10-03-crm-f004-workspace-design.md`

## Global Constraints

- Branch `feat/crm-workspace-testing`, status EM TESTE, sem merge em main.
- `version: 1`; favoritos únicos, máximo seis; layouts são permutações/subconjuntos dos IDs conhecidos.
- Identidade de usuário/organização vem exclusivamente do principal autenticado, nunca de parâmetros ou payload.
- Preferências acompanham o usuário entre dispositivos, separadas por organização.
- Escritas ocorrem por **Salvar preferências**; mudanças são rascunho até salvar.
- Falha no salvamento preserva rascunho. Resposta atrasada de GET não substitui navegação manual.
- Widgets dependem das permissões; preferências não concedem acesso.
- Comunicação permanece montada após primeira abertura e é removida no logout.
- Ler `apps/web/AGENTS.md` e os guias locais Next pertinentes antes de editar web.
- Integração PostgreSQL/Compose/E2E não pode ser declarada aprovada sem execução real.

## Review Focus

1. GET termina depois de navegação manual: manter a seção escolhida, testado na tarefa 2.
2. Perfil perde permissão: filtrar favoritos/componentes e usar Início se seção inicial estiver proibida, testado nas tarefas 1–3.
3. Falha de PUT após edição: manter rascunho e não anunciar salvamento, testado na tarefa 4.
4. Troca de identidade com requisição pendente: descartar resposta antiga e dados anteriores, testado na tarefa 2.
5. Navegação com chamada aberta: manter a mesma instância do iframe, testado nas tarefas 3 e 6.

## Arquivos e interfaces compartilhadas

- `packages/contracts/src/workspace-preferences.ts`: schemas/tipos e IDs de destinos/componentes.
- `apps/api/src/workspace/`: controller, service e módulo para leitura/gravação individual.
- `apps/web/src/app/workspace/navigation.ts`: catálogo de destinos, grupos e permissões.
- `workspace-provider.tsx`: carregamento, rascunho, salvamento e estado por identidade.
- `workspace-home.tsx` e `workspace-editor.tsx`: início e editor, responsabilidades separadas.
- `apps/web/src/app/admin/users-view.tsx` e `support-settings-view.tsx`: administração pelas APIs/componentes existentes.

`WorkspacePreferences` terá version, defaultSection, favorites, homeOrder, homeHidden, dashboardOrder, dashboardHidden. IDs de início: `favorites`, `today`, `indicators`. IDs de dashboard: `value`, `pending`, `overdue`, `undated`, `stages`, `sales`. Destinos: `home`, os dez CrmSection atuais, `admin-users`, `support-settings`, `workspace-settings`.

### Tarefa 1 — Contratos e persistência individual

**Files:** criar `packages/contracts/src/workspace-preferences.ts`, `workspace-preferences.spec.ts`; modificar `packages/contracts/src/index.ts` e `apps/api/prisma/schema.prisma`; criar `apps/api/prisma/migrations/20261004003000_workspace_preferences/migration.sql`; criar módulo/service/controller e testes em `apps/api/src/workspace/`; modificar `apps/api/src/app.module.ts`.

**Interfaces:** exportar `WorkspacePreferencesSchema`, `WorkspacePreferences`, `createDefaultWorkspacePreferences(): WorkspacePreferences`. Service `read(principal: AuthenticatedPrincipal): Promise<WorkspacePreferences>` e `save(input: WorkspacePreferences, principal: AuthenticatedPrincipal, requestId: string): Promise<WorkspacePreferences>`. Controller GET/PUT `/me/workspace-preferences`, com AuthenticationGuard; rejeitar principal `api_key` nesses endpoints pessoais.

- [ ] Escrever testes: defaults são version 1, favoritos vazios, Início, três home IDs e seis dashboard IDs; rejeitar duplicatas, sete favoritos, IDs desconhecidos, layouts incompletos e campos organizationId/userId.
- [ ] Executar `pnpm --filter @axes/contracts test`; confirmar falhas por contrato ausente.
- [ ] Implementar contrato Zod estrito e exports; executar novamente, esperar PASS.
- [ ] Escrever integração GET default, PUT/upsert, tenant A/B, dois usuários no mesmo tenant, vínculos inativos, API key rejeitada, favorito/seção inicial sem permissão e auditoria sem tokens. Registrar fixtures pelo padrão das integrações existentes.
- [ ] Executar `pnpm --filter @axes/api test workspace-preferences.integration.spec.ts`; observar falha pelo endpoint/tabela ausente, ou registrar bloqueio de infraestrutura se PostgreSQL não estiver disponível.
- [ ] Criar modelo com chave composta organizationId/userId e FK para OrganizationMembership; criar tabela JSONB, RLS/FORCE RLS e política pelo contexto de organização. Service usa `withTenant` e chave composta explícita; identidade é sempre do principal. PUT valida permissões efetivas e audita ação `workspace.preferences.updated` pelo padrão de AuditService.
- [ ] Gerar Prisma, executar migração em banco de teste e repetir testes. Acrescentar teste unitário do service para filtros/validação se banco estiver indisponível, sem declarar integração verde.
- [ ] Commit `feat(workspace): persistir preferências individuais com isolamento`.

### Tarefa 2 — Catálogo e provider de sessão

**Files:** criar `apps/web/src/app/workspace/navigation.ts`, `navigation.test.ts`, `workspace-provider.tsx`, `workspace-provider.test.tsx`; modificar `page.tsx`.

**Interfaces:** `availableDestinations(permissions: readonly string[]): NavigationDestination[]`; `sanitizeWorkspacePreferences(value: WorkspacePreferences, permissions: readonly string[]): WorkspacePreferences`; `WorkspaceProvider({session, children})`; `useWorkspace()` fornece saved, draft, loading, saving, error, setDraft, save, restoreDefaults. Provider é keyed por organizationId:userId.

- [ ] Testar catálogo sem permissões, empresas/contatos com suas permissões, filtros de perfil revogado e fallback para Início.
- [ ] Rodar `pnpm --filter @axes/web exec vitest run src/app/workspace/navigation.test.ts`; confirmar falha antes de implementar.
- [ ] Implementar catálogo e sanitização, preservando no máximo seis favoritos autorizados; executar novamente, esperar PASS.
- [ ] Escrever testes provider: GET default, PUT só após Salvar, PUT com erro conserva draft, defaults sem bloquear navegação em GET com erro, requisições antigas ignoradas após troca de sessão/logout.
- [ ] Escrever teste Home: clicar destino antes de GET resolver impede aplicação posterior de defaultSection; nova sessão redefine o controle de navegação manual.
- [ ] Rodar testes novos e observar falha; implementar provider com apiRequest e schema de resposta; guardar contador/ref por identidade para ignorar respostas antigas.
- [ ] Integrar provider após autenticação; início padrão é home, defaultSection é aplicado uma única vez se o usuário ainda não navegou. Testar e commit `feat(workspace): carregar preferências por sessão`.

### Tarefa 3 — Menu agrupado e favoritos

**Files:** modificar `crm-shell.tsx`, `page.tsx`, `globals.css`; criar `workspace-navigation.test.tsx`; adaptar testes de navegação existentes para abrir o grupo quando necessário.

**Interfaces:** CrmSection passa a consumir os IDs do contrato; CrmShell recebe favoritos sanitizados. NavigationDestination contém id, label, group, permission e ícone no frontend.

- [ ] Escrever testes dos cinco grupos, grupos vazios omitidos, grupo ativo aberto, Favoritos até seis, nomes acessíveis e destino proibido bloqueado inclusive em onNavigate.
- [ ] Escrever regressão: abrir NEO, ir a Início, Preferências e outro grupo mantém a mesma instância; logout remove. Drawer mobile mantém foco, Escape e fechamento ao navegar.
- [ ] Executar testes e confirmar falha por menu ainda plano.
- [ ] Substituir lista plana por catálogo, Início permanente, favoritos e disclosure buttons aria-expanded; preservar lógica mobile existente. Evitar duplicar botão de destino favorito dentro do mesmo nível da navegação.
- [ ] Implementar estados de grupo sem fechamento involuntário ao atualizar preferências; manter acesso por teclado no sidebar recolhido.
- [ ] Executar testes antigos e novos; commit `feat(workspace): agrupar navegação e favoritos`.

### Tarefa 4 — Início e editor de preferências

**Files:** criar `workspace-home.tsx`, `workspace-home.test.tsx`, `workspace-editor.tsx`, `workspace-editor.test.tsx`; modificar `agenda/agenda-view.tsx`, `reports/dashboard-widgets.tsx`, `reports/management-summary-view.tsx`, `page.tsx`, `globals.css`.

**Interfaces:** AgendaView recebe `initialFocus?: "WEEK" | "TODAY" | "OVERDUE"`, padrão WEEK. DashboardWidgets recebe configuração controlada opcional `{order,hidden}`, mantendo compatibilidade com CRM-F003 isolada. WorkspaceHome recebe sessão, preferências salvas e onNavigate. WorkspaceEditor edita draft via useWorkspace e não grava em cada interação.

- [ ] Testar três componentes, visibilidade/permissões, ordenação, nenhuma seleção e caminho para restaurar; agenda inicia TODAY apenas no Início. Componentes ocultos não fazem suas consultas.
- [ ] Testar favoritos únicos/máximo seis, destino inicial permitido, componentes reordenados por botões e salvar/restaurar como rascunho.
- [ ] Testar falha de PUT com draft mantido e aviso; sucesso confirma resposta da API; dashboard servidor prevalece sobre localStorage. Importação de layout local só ocorre por ação explícita e Salvar.
- [ ] Executar testes para confirmar falhas; implementar componentes usando agenda e DashboardWidgets, carregamento de resumo restrito ao componente indicadores visível/permitido e erros independentes.
- [ ] Usar o layout do servidor também no Resumo gerencial quando provider existir. Manter comportamento standalone da CRM-F003; personalização em contexto do provider altera draft e exige salvar.
- [ ] Renderizar saudação/data e Personalizar início sem exibir abas de todos os relatórios no Início. Reutilizar navegação para abrir relatório relacionado sem abrir NEO automaticamente.
- [ ] Executar testes, tipos e build; commit `feat(workspace): início personalizável e editor`.

### Tarefa 5 — Administração pelas APIs existentes

**Files:** criar `admin/users-view.tsx`, `users-view.test.tsx`, `support-settings-view.tsx`, `support-settings-view.test.tsx`; modificar `page.tsx`; extrair componentes de configuração se necessário preservando arquivos de origem.

**Interfaces:** UsersView recebe accessToken; usa GET/POST `/admin/users` e PATCH `/admin/users/:membershipId` com schemas CreateOrganizationUserInputSchema/UpdateOrganizationMembershipInputSchema existentes. SupportSettingsView reutiliza SupportQueuesPanel e componentes de SLA existentes, com `support.manage`.

- [ ] Testar listagem, criação, alteração de papel/ativação, validação/erros, ausência de user.manage e erros de regras administrativas retornados pela API.
- [ ] Testar configuração de filas/SLA acessível só com support.manage; atendimento operacional ainda funciona sem essa permissão.
- [ ] Rodar testes e observar falhas; implementar UI com validação dos contratos atuais, sem novos papéis nem editor arbitrário de permissões.
- [ ] Reunir os editores existentes na página de configuração e preservar links funcionais nas telas operacionais conforme permissões.
- [ ] Executar testes e commit `feat(workspace): reunir administração e configuração`.

### Tarefa 6 — Regressão e entrega em teste

**Files:** criar `docs/features/CRM-F004-workspace-em-teste.md`; criar `tests/e2e/workspace.spec.ts` na localização efetiva definida em playwright.config; atualizar docs/roadmap.md com feature EM TESTE, preservando marcos anteriores.

- [ ] Escrever E2E com dois usuários e dois contextos de navegador: salvar preferências, recarregar, isolar contas e validar tela inicial; perfil sem acesso não mostra componentes proibidos.
- [ ] Homologar desktop/mobile, teclado e manutenção do iframe; não usar NEO real em testes automatizados de navegação, usar origem de fixture autorizada.
- [ ] Executar testes de contratos/web/API, pnpm test, typecheck, builds e formato. Registrar qualquer falha, inclusive Docker ENOENT se ainda ausente.
- [ ] Executar integração PostgreSQL/Compose/E2E e imagens se infraestrutura estiver disponível; registrar pendências de modo explícito quando não estiver.
- [ ] Revisar a branch inteira contra spec/plano; corrigir problemas antes de publicar. Revisor independente somente na entrega final se execução direta for escolhida.
- [ ] Registrar comandos/resultados e roteiro manual na feature, publicar commits na branch de teste e verificar conteúdo remoto. Não mesclar em main.

## Auto-revisão do plano

Cada seção da especificação tem tarefa: navegação 2–3, início/personalização 4, contrato/persistência 1–2, administração 5, comunicação/segurança/erros 1–4/6. Casos do Review Focus estão explicitamente cobertos. IDs e nomes são únicos e compartilhados entre tarefas. A referência à infraestrutura real não é substituída por mocks.

## Execução proposta

Execução direta nesta sessão, tarefas em ordem, com revisão independente ao final. As tarefas dependem fortemente do contrato de preferências e catálogo; implementação sequencial reduz mudanças concorrentes nesses pontos. Alternativa: execução com agentes por tarefa, com revisões intermediárias e maior custo de contextos.
