# CRM Axesistemas — Four-Month Acceleration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement approved, bounded tasks. Track each delivery with checkboxes and evidence from its exact commit.

**Goal:** Organizar a meta de antecipação de quatro meses do CRM em quatro blocos nominais de entrega, com aceite verificável e os gates existentes preservados.

**Architecture:** Evoluir as microentregas já existentes em quatro frentes coordenadas: dados, dashboards, qualidade e operação. Cada incremento passa por desenvolvimento, revisão e CI; homologação e produção exigem evidências próprias.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL com RLS, Next.js, Jest, Playwright, pnpm e Docker Compose.

**Spec:** Pedido de Jefferson para seguir com quatro meses antecipados; [desenho de backup](../specs/2026-10-05-crm-backup-design.md), [gate de restauração](../../deploy/restore-confirmation-gate.md) e [handoff operacional](../../releases/2026-10-12-crm-evidence-handoff.md). O estado atual abaixo prevalece sobre o status histórico dos desenhos.

## Global Constraints

- Referência deste plano: `main` em `85dbae0d5b08a7a84a2afa9b79aaf24012e6ddfd`, em 18/10/2026. A data identifica o checkpoint; não é início nem prazo de entrega.
- Os quatro blocos representam uma **meta de antecipação no planejamento**. Não comprovam meses ou horas trabalhados, não garantem data e não se somam à referência anterior de três meses. Sem baseline original datada confiável, não calcular ganho efetivo de calendário.
- Desenvolvimento, CI, staging e produção têm estados independentes. Merge ou CI verde não comprovam homologação nem implantação.
- Não liberar os dashboards enquanto o gate [#256](https://github.com/jeffaxe81/crm-vendas/issues/256) bloquear merge/deploy. A homologação real [#255](https://github.com/jeffaxe81/crm-vendas/issues/255) permanece não executada.
- O restore continua interno. Não expor restauração completa até concluir o escopo e os controles de [#250](https://github.com/jeffaxe81/crm-vendas/issues/250).
- Não executar expurgo ou restauração de dados reais como teste. Sem acesso ao servidor, [#159](https://github.com/jeffaxe81/crm-vendas/issues/159) continua pendente e o GO operacional não pode ser declarado.

## Estado de partida

| Escopo                                                                                          | Desenvolvimento / integração                                                                                                                                                   | CI, staging e produção                                                |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Expurgo por tenant #240/#241; capacidade lógica #244; reconciliação física #247 e paginada #249 | Mesclados em `main`. Capacidade lógica não é quota física; reconciliação não prova restaurabilidade.                                                                           | Este plano não revalida os runs nem comprova deploy.                  |
| Restore de tags #251 e de funis/etapas #253                                                     | Mesclados. Subconjunto interno: `Company`, `Contact`, `ContactChannel`, `CompanyContact`, `RelationshipEntry`, `Tag`, `CompanyTag`, `ContactTag`, `Pipeline`, `PipelineStage`. | Não equivalem a restore completo homologado.                          |
| Próximo grafo comercial                                                                         | `Product`, `Opportunity`, `OpportunityItem` e `Activity` em implementação nesta sessão; não concluídos neste checkpoint.                                                       | Testes, revisão e CI do incremento ainda precisam produzir evidência. |
| Restore completo #250; evolução de cotas/reservas/inventário/expurgo #246                       | Pendentes além dos subconjuntos já mesclados.                                                                                                                                  | Sem aceite final de staging ou produção.                              |
| Dashboards #242, #245, #248 e #254                                                              | Drafts: plano, fundação, UI de volume e deltas/CSV/PT-EN-ES, respectivamente.                                                                                                  | Merge/deploy bloqueados por #256; staging real #255 não executado.    |
| Laboratório externo sintético de QA #243                                                        | PR aberto, não draft, em revisão.                                                                                                                                              | Não comprova operação no servidor nem substitui #255/#159.            |

## Quatro frentes em paralelo

Os responsáveis abaixo são papéis de trabalho, não nomeações de pessoas nem promessa de agentes executando fora de uma sessão ativa. Cada PR registra um executor e um revisor identificados; alterações no mesmo arquivo exigem coordenação.

| Frente                     | Responsabilidade                                                                    | Handoff obrigatório                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A — Dados e recuperação    | Restore #250 e evolução de armazenamento #246, em incrementos limitados.            | Contratos, migrações, testes PostgreSQL/RLS e limites ainda não suportados.            |
| B — Dashboards             | Preparar e revisar os drafts #242/#245/#248/#254.                                   | Contratos consumidos, testes de UI/exportação/idiomas e cumprimento de #256.           |
| C — Qualidade e CI         | Revisar #243 e verificar regressões, isolamento, concorrência e evidências por SHA. | Resultados reproduzíveis; falha ou teste não executado fica explícito.                 |
| D — Homologação e operação | Preparar #255/#159 com o operador autorizado e acesso ao ambiente.                  | Versão efetivamente implantada, relatórios privados, recuperação e aceite operacional. |

## Quatro blocos mensais nominais

“Mês” indica a ordem do pacote planejado, sem correspondência assumida com meses do calendário. Um bloco só encerra quando seu aceite está demonstrado; pendências passam adiante com o bloqueio visível.

| Bloco                                                      | Entrega do escopo existente                                                                                                                                                                                                                                              | Testes e critério de aceite                                                                                                                                                                                                                                                                                                                                                | Dependências e status inicial                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mês nominal 1 — próximo incremento verificável**         | A: grafo `Product`/`Opportunity`/`OpportunityItem`/`Activity`. B: revisar fundação e contratos dos drafts. C: revisar laboratório #243. D: preparar roteiro e requisitos de acesso de #255/#159.                                                                         | Round-trip PostgreSQL/RLS do grafo comercial; Decimal exato e timestamps com microssegundos; ordem de FKs, referência inválida antes da primeira exclusão, rollback tardio e preservação de outro tenant. Revisão e CI do SHA do incremento.                                                                                                                               | Base mesclada e executor interno existente. **Em andamento no desenvolvimento**; nenhuma declaração de staging/produção. Dashboards continuam bloqueados.                   |
| **Mês nominal 2 — completar proteções antes da exposição** | A: sequenciar os modelos e políticas restantes de #250; integrar cópia preventiva, confirmação e orquestração/UI somente após as proteções. Detalhar reservas/cotas/inventário/expurgo de #246 em microentregas. B/C: validar os drafts e regressões sem contornar #256. | Restore deve abortar sem alterações para política não suportada, cópia preventiva inválida ou sem capacidade; manter identidade/acesso do executor, preservar/revogar o que cada política determina, confirmar uma única vez e fazer rollback integral. Reservas/cotas só aceitas com testes de concorrência e recuperação; alocação indicativa não vale como enforcement. | Depende do bloco 1 e da revisão das políticas especiais. **Planejado**; #250 e #246 continuam abertos até seus critérios próprios.                                          |
| **Mês nominal 3 — evidência de homologação**               | C/D: executar #255 em ambiente autorizado com dados sintéticos; ensaiar recuperação e rollback. A/B: corrigir falhas encontradas e apresentar evidências para avaliação do gate #256.                                                                                    | Dois tenants sob RLS; perfis sem privilégio negados; backup verificado e restore completo apenas se #250 estiver pronto; confirmação expirada/duplicada, corrupção, falha de FK, capacidade e concorrência entre réplicas. Para dashboards: dados conferidos, paginação/volume, deltas, CSV e PT/EN/ES conforme os drafts.                                                 | Exige ambiente, operador e versão identificada; #243 pode apoiar, não substituir a homologação real. **Não executado**; #256 permanece ativo até sua resolução documentada. |
| **Mês nominal 4 — decisão operacional por evidências**     | D: concluir verificações aplicáveis de #159 e apresentar GO/NO-GO da versão candidata. Demais frentes corrigem bloqueios e entregam documentação operacional; publicação depende do gate aplicável.                                                                      | CI de `push/main` no SHA exato, comprovação dos containers implantados, TLS confiável, smoke autenticado externo, isolamento, persistência, restauração/rollback ensaiados e aceite do operador. Registrar falhas e pendências sem promover evidência sintética a produção.                                                                                                | Depende de staging aprovado, resolução dos bloqueios e acesso ao servidor. **Planejado e bloqueado operacionalmente**; nenhuma data ou aprovação de produção prometida.     |

## Próxima entrega corrente

O [checkpoint do grafo comercial](../../checkpoints/2026-10-18-commercial-restore-four-month-plan.md) registra o incremento preparado nesta sessão e o RED reproduzido. O [PR #257](https://github.com/jeffaxe81/crm-vendas/pull/257) registra o SHA e o CI de integração. O estado de partida acima é histórico e permanece referenciado à base indicada.

- [x] Implementar o incremento limitado de `Product`, `Opportunity`, `OpportunityItem` e `Activity`, preservando Decimal, microssegundos e dependências reais.
- [x] Acrescentar round-trip, exclusão de registros novos ausentes na cópia, pré-validação, rollback, RLS e isolamento aos testes do executor, incluindo associações do responsável removidas/recriadas.
- [x] Revisar o diff e corrigir a validação de associações antes de exclusões. Manter o bloqueio para outros modelos e restore sem rota/botão/worker público neste incremento.
- [x] Registrar o subconjunto e as políticas pendentes no checkpoint; exigir CI completo do SHA candidato antes da integração. O resultado corrente fica no PR, separado de staging e produção.

## Continuidade do bloco 2 — territórios, filas e SLA

Na base `321e2f19ea42467668d06cc744277cd44a15c8c7`, as PRs #243 e #257 já estão integradas e seu CI de `push/main` foi aprovado. A [PR #258](https://github.com/jeffaxe81/crm-vendas/pull/258) acrescenta seis políticas `REPLACE` ao executor interno: `Territory`, `TerritoryQuota`, `TerritoryTarget`, `TerritoryMetrics`, `SupportQueue` e `SlaPolicy`.

O [checkpoint desse incremento](../../checkpoints/2026-10-18-restore-territories-support-config.md) registra o escopo e os testes. A integração exige CI completo do SHA candidato e confirmação da árvore final. Chamados, campos personalizados, perfis/permissões, preferências e as políticas especiais continuam seguindo os critérios de #250. Os quatro blocos e os gates de homologação/produção deste plano permanecem aplicáveis.

## Continuidade do bloco 2 — campos personalizados e workspace

Na base `ef793e79a18ecc73928bfeb9abc4a60cc836e71e`, o executor interno já cobre os 20 modelos das PRs anteriores. A [PR #259](https://github.com/jeffaxe81/crm-vendas/pull/259) acrescenta `CustomFieldDefinition`, `CompanyCustomFieldValue`, `ContactCustomFieldValue` e `UserWorkspacePreference`, com recuperação nativa de JSON bruto e checagem da associação atual do usuário.

O [checkpoint desse incremento](../../checkpoints/2026-10-18-restore-custom-fields-workspace.md) registra o RED observado nos 26 casos PostgreSQL e em 14 regressões unitárias, com os outros 958 testes da API passando. O formato de backup permanece o mesmo. A integração depende também do GREEN, revisão independente, CI completo do candidato e confirmação de origem da `main`. Os quatro modelos organizacionais `REPLACE` restantes (`Role`, `RolePermission`, `Ticket` e `TicketEvent`), configuração raiz, políticas especiais e orquestração integral seguem na #250; os gates operacionais permanecem aplicáveis.

## Review Focus

1. Decimal ou timestamp alterado na ida e volta: rejeitar a entrega do bloco 1 se perder precisão.
2. FK inválida ou falha após exclusões: provar pré-validação e rollback no bloco 1; ampliar para as políticas restantes no bloco 2.
3. Identidade, sessão ou privilégio recuperado indevidamente: provar as políticas especiais antes de expor #250 no bloco 2.
4. Catálogo divergente do disco ou concorrência por capacidade: manter a reconciliação diagnóstica e exigir reservas verificáveis na evolução de #246, no bloco 2.
5. CI/laboratório confundido com servidor homologado: exigir evidências independentes de #255 e #159 nos blocos 3 e 4.

Este documento altera o planejamento. Não fecha issues, não libera gates, não aprova merge e não registra implantação.
