# Assistente de Qualidade do CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Execução sugerida: nesta sessão, sem delegação.

**Goal:** Testar o CRM desde a criação de empresa e usuário até o uso cotidiano, pausando diante de anomalias para decisão humana.
**Architecture:** API NestJS controla execuções e decisões por tenant; executor separado usa Playwright com roteiros fixos; interface administrativa acompanha resultados. PostgreSQL/RLS mantém isolamento e auditoria.
**Tech Stack:** TypeScript, NestJS, Prisma, PostgreSQL, Next.js, Playwright, Jest e Vitest.
**Spec:** docs/superpowers/specs/2026-10-16-assistente-qualidade-design.md

## Global Constraints
- Criação antes do login: cadastro público cria organização e administrador, sessão resultante cria usuário comum, logout, login explícito do usuário comum.
- Exclusivamente homologação, dados sintéticos, execução manual e serializada; sem correção automática.
- Evidências sete dias; metadados e decisões 30 dias; dados sintéticos até encerramento com limpeza explicitamente solicitada ou expiração de sete dias.
- Execução ativa até 30 minutos, excluindo espera; decisão expira em 24 horas.
- Não persistir credenciais, cookies, tokens ou traces brutos.
- Não acessar tenants externos à execução nem enviar comunicações reais.
- Ler apps/web/AGENTS.md e os guias locais de Next.js exigidos antes de alterar código web.

## Review Focus
- Duplo clique ao iniciar: uma única execução ativa, mesmo com duas instâncias da API (Tarefa 2).
- Reinício após cadastro: não repetir a criação e não perder a ocorrência (Tarefa 3).
- Cadastro abre sessão automaticamente: não confundir com login explícito bem-sucedido (Tarefa 4).
- Resposta negativa esperada: não classificar validação ou refresh inicial sem sessão como bug (Tarefa 3).
- Decisão em aba antiga ou outro tenant: rejeitar alteração sem revelar dados (Tarefas 2 e 5).

## Estrutura e contexto confirmado
Fluxos existentes: apps/web/src/app/page.tsx, apps/web/src/app/admin/users-view.tsx, apps/api/src/auth/auth.controller.ts, apps/api/src/users/organization-users.controller.ts.
Registro usa POST /api/v1/auth/register; login usa POST /api/v1/auth/login; usuário usa POST /api/v1/admin/users com user.manage.
A página inicia visualmente no modo login; o roteiro deve clicar Cadastre-se antes de preencher o cadastro, sem autenticar conta pré-existente.
Novos módulos vivem em apps/api/src/quality-assistant e apps/web/src/app/admin. Roteiros ficam em scripts/quality-assistant. Não alterar a semântica do cadastro para acomodar o teste.
Antes de executar: obter checkout isolado da branch de documentação, atualizar com main, conferir AGENTS.md aplicáveis e manter dependências fixadas do repositório.

### Tarefa 1: Contratos, sequência e transições
**Files:** criar packages/contracts/src/quality-assistant.ts e quality-assistant.test.ts; modificar packages/contracts/src/index.ts.
**Interfaces:** QualityRunState, QualityStepId, QualityDecisionInputSchema e QualityRunResponseSchema; etapas CREATE_ORGANIZATION, CREATE_USER, LOGIN, PERMISSIONS, CONTACTS, OPPORTUNITIES, FILTERS. Exportar nextQualityAction(run, decision): QualityAction, função pura com pré-condições satisfeitas por etapa.
- [ ] Escrever testes que verificam ordem exata, bloqueio de dependentes, pausa diante de ocorrência e rejeição de decisão após cancelamento.
- [ ] Rodar pnpm --filter @axes/contracts test; confirmar falha nos novos casos antes da implementação.
- [ ] Implementar schemas Zod e transições: registrar bug/investigar não retomam; esperado/ignorar retomam somente com pré-condições; ações repetir/pular dependentes/encerrar são explícitas.
- [ ] Reexecutar os testes; exigir aprovação de todos os casos.
- [ ] Commit: feat: define quality assistant contracts and transitions.

### Tarefa 2: Persistência e API administrativa
**Files:** modificar apps/api/prisma/schema.prisma, apps/api/src/app.module.ts; criar apps/api/prisma/migrations/20261016040000_quality_assistant/migration.sql e apps/api/src/quality-assistant/{quality-assistant.module.ts,quality-assistant.controller.ts,quality-assistant.service.ts,quality-assistant.integration.spec.ts}.
**Interfaces:** QualityAssistantService.start(context), get(context, runId), decide(context, runId, input), cancel(context, runId). Context contém organizationId, actorUserId e requestId obtidos da autenticação. Rotas POST/GET admin/quality-assistant/runs, GET runs/:id, POST runs/:id/decisions e POST runs/:id/cancel; user.manage mais verificação explícita de ADMIN.
- [ ] Criar testes de autorização, RLS, outro tenant, decisão obsoleta, duplo start concorrente e auditoria.
- [ ] Rodar pnpm --filter @axes/api test -- --runTestsByPath src/quality-assistant/quality-assistant.integration.spec.ts; confirmar falhas.
- [ ] Criar modelos QualityRun, QualityStep, QualityFinding, QualityDecision e QualityResource com organizationId, FKs compostas, RLS forçada e estados validados. Estado do run inclui version para concorrência otimista; decisões exigem expectedVersion e retornam conflito se obsoletas.
- [ ] Implementar serviço transacional, lock global de execução ativa no banco, habilitação por QUALITY_ASSISTANT_ENABLED=true e APP_ENV=homologation. Não aceitar URL ou scripts na entrada. Guardar decisões locais, sem abrir issues externas.
- [ ] Aplicar migração em banco de teste, gerar Prisma e executar testes; comprovar rejeição entre tenants.
- [ ] Commit: feat: persist and authorize quality assistant runs.

### Tarefa 3: Executor, evidências e recuperação
**Files:** criar scripts/quality-assistant/{worker.ts,run-store.ts,evidence.ts,environment.ts}; criar apps/api/src/quality-assistant/{quality-worker-store.ts,quality-worker-store.spec.ts,evidence.spec.ts}; modificar package.json.
**Interfaces:** claimRun(): Promise<QualityRunResponse|null>, recordStep(runId, version, result), recordFinding(runId, finding), heartbeat(runId), interruptRun(runId); sanitizeEvidence(input): SafeEvidence. Worker acessa banco pelo adaptador interno, sem API pública de ingestão.
- [ ] Escrever testes: concorrência de claim, perda de heartbeat, cancelamento, relógio ativo de 30 minutos, espera de 24 horas, deduplicação por execução e segredo em mensagens/URLs. Testar erro HTTP esperado versus inesperado.
- [ ] Rodar os testes direcionados da API; confirmar falhas.
- [ ] Implementar lease persistente e checkpoints. Após lease expirado registrar interrupção e aguardar decisão, sem replay. Usar QUALITY_ASSISTANT_BASE_URL configurada no servidor; restringir navegação e requisições à origem autorizada e recursos locais necessários, bloqueando integrações externas.
- [ ] Capturar apenas método, caminho sem query sensível, status, requestId e mensagens sanitizadas. Mascarar inputs sensíveis nas capturas; não guardar payloads de autenticação. Desligar trace e vídeo bruto neste executor. Falha inicial esperada de refresh sem sessão e validações negativas do roteiro não geram bug.
- [ ] Adicionar comando quality:worker com tsx existente e fechamento de navegador no cancelamento/timeout; testar sanitização, recuperação e tempos com relógio controlado.
- [ ] Commit: feat: run quality scenarios with safe evidence and recovery.

### Tarefa 4: Jornada criação → usuário → login → uso do CRM
**Files:** criar scripts/quality-assistant/{crm-journey.ts,journey-fixtures.ts}; criar tests/e2e/quality-assistant-journey.spec.ts.
**Interfaces:** runCrmJourney(page, run, checkpoint): Promise<void>; cada etapa retorna pré-condições observadas e IDs sintéticos em QualityResource. Usuário comum usa o papel de vendas existente, nunca ADMIN.
- [ ] Escrever E2E que prova: Cadastre-se é a primeira ação funcional, registro antecede criação de usuário, logout antecede POST auth/login e nenhum login prévio usa conta existente. Induzir falha de criação e verificar ausência de passos dependentes.
- [ ] Rodar pnpm exec playwright test tests/e2e/quality-assistant-journey.spec.ts; confirmar falha inicial.
- [ ] Implementar seletores por papel/label dos componentes existentes. Preencher Nome da organização, Seu nome, E-mail, Senha e Confirmar senha; clicar Criar organização. Validar sessão de cadastro; criar usuário via tela administrativa; sair; preencher login e identificador da empresa; autenticar usuário padrão.
- [ ] Implementar contatos/clientes, oportunidade e mudança de etapa, busca e filtros utilizando os fluxos atuais de tests/e2e/crm-core.spec.ts como referência; confirmar persistência após reload. Criar segunda organização sintética em contexto separado para mesmo e-mail e isolamento. Não usar queries SQL como substituto da criação pela interface.
- [ ] Induzir API 500 com mensagem visual indevida e verificar ocorrência; testar 4xx esperado e permissão proibida esperada sem falso positivo. Falta de funcionalidade é ocorrência/bloqueio, não sucesso silencioso.
- [ ] Rodar novamente E2E contra banco isolado migrado e guardar resumo sem credenciais.
- [ ] Commit: feat: exercise crm onboarding before explicit login.

### Tarefa 5: Interface de execução e decisões
**Files:** criar apps/web/src/app/admin/quality-assistant-view.tsx e quality-assistant-view.test.tsx; modificar apps/web/src/app/page.tsx, apps/web/src/app/crm-shell.tsx e packages/contracts/src/workspace-preferences.ts.
**Interfaces:** QualityAssistantView({accessToken, permissions}); consumir contratos e rotas da Tarefa 2; polling a cada três segundos enquanto a aba estiver ativa, sem sobreposição.
- [ ] Escrever testes para ordem visível, ocorrência aguardando decisão, comandos repetir/pular/encerrar, cancelamento e conflito de versão após decisão em outra aba.
- [ ] Rodar pnpm --filter @axes/web test -- src/app/admin/quality-assistant-view.test.tsx; confirmar falha.
- [ ] Ler guias Next.js locais exigidos por AGENTS.md e implementar tela administrativa com Iniciar verificação, etapas, evidências e pergunta O que deseja fazer?. Ocultar comando quando ambiente não habilitado; a API permanece a autoridade.
- [ ] Acrescentar destino admin-quality-assistant à navegação e renderização restrita a ADMIN autorizado. Não substituir a tela de usuários ou preferências.
- [ ] Rodar testes direcionados e typecheck; exigir resultado aprovado.
- [ ] Commit: feat: add quality assistant administration and decisions.

### Tarefa 6: Retenção, configuração e aceite integrado
**Files:** criar scripts/quality-assistant/cleanup.ts e apps/api/src/quality-assistant/quality-cleanup.spec.ts; modificar .env.example, docker-compose.yml e .github/workflows/ci.yml; criar docs/operations/quality-assistant.md. Confirmar nome do arquivo Compose existente no checkout antes de editar; usar o arquivo raiz vigente em vez de criar stack concorrente.
**Interfaces:** cleanupQualityRuns(now): Promise<CleanupSummary>; remover recursos exclusivamente pelo manifesto de IDs da execução; processar via worker mesmo quando não houver execução ativa.
- [ ] Escrever testes: evidência expira em sete dias, metadados em 30, dados sintéticos em sete, limpeza não remove registros alheios, falha de limpeza preserva manifesto e gera relatório.
- [ ] Rodar testes de limpeza; confirmar falha inicial.
- [ ] Implementar retenção e limpeza com relações em ordem segura, sem deletes por nome/prefixo. Guardar IDs de segurança até resolver limpeza; purgar relatório após sucesso e retenção correspondente.
- [ ] Configurar worker somente no perfil homologação, com navegador e dependências compatíveis com versão fixada do Playwright; documentar variáveis, migração e inicialização. Comunicação externa permanece bloqueada.
- [ ] Rodar pnpm verify e E2E específico, incluindo ciclo empresa/usuário/login, pausa, decisão, retomada, cancelamento e isolamento. Falha de infraestrutura deve aparecer como tal, nunca como teste aprovado.
- [ ] Conferir diff e evidências, registrar resultados reais e limitações. Abrir PR para revisão; não fazer merge ou anunciar testes que não foram executados.
- [ ] Commit: feat: finalize quality assistant lifecycle and acceptance.

## Handoff
Plano revisado contra a especificação: tarefas 1–2 cobrem decisões e isolamento, 3 evidências/limites/recuperação, 4 jornada, 5 administração, 6 retenção e aceite. Recomendo execução nesta sessão porque os componentes compartilham contratos e estados. Implementação começa após revisão deste plano e escolha do método.
