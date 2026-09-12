# Roadmap do Produto

| Fase                   | Direção                                                                 | Situação                             |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| Fase 0 — Descoberta    | Finalidade comercial, escopo do MVP e documentação inicial              | Concluída para o incremento atual    |
| Fase 1 — MVP Comercial | Acesso, cadastros, atividades, funil, painel e auditoria                | Release fechada — 11/09/2026         |
| Fase 2 — Produtividade | Campos personalizados, tags, agenda, importação, produtos e relatórios  | Em andamento — C4.1 Agenda Comercial |
| Fase 3 — Atendimento   | Solicitações, protocolos, filas, SLA e satisfação                       | Planejada                            |
| Fase 4 — Integrações   | API REST, webhooks, e-mail, WhatsApp, telefonia e ERP                   | Planejada                            |
| Fase 5 — Automação     | Regras, distribuição, jornadas e alertas                                | Planejada                            |
| Fase 6 — IA assistida  | Resumos, recomendações, classificação e previsões com supervisão humana | Banco de Ideias                      |

## Marco concluído

A Fase 1 — MVP Comercial foi fechada com fluxo comercial utilizável de ponta a ponta: cadastro de cliente, oportunidade, histórico/interações, atividades e acompanhamento do avanço no funil.

A evidência canônica do fechamento está registrada em `docs/releases/mvp-commercial-phase-1-2026-09-11.md`.

## Marco atual

A Fase 2 — Produtividade foi autorizada e iniciada pela **C4.1 — Agenda Comercial**. Esta microentrega reutiliza o domínio `Activity` para disponibilizar uma visão semanal de tarefas e compromissos, com navegação temporal, filtros e controle de acesso por `activity.read`.

Campos personalizados e tags já existem na base atual e não serão reimplementados. Importação, produtos e relatórios permanecem como próximos blocos planejados da Fase 2.

> **Delimitação de escopo vigente:** somente a C4.1 — Agenda Comercial está em implementação/validação neste incremento. Os demais itens da Fase 2 e as Fases 3 a 6 continuam planejados, sem desenvolvimento automático.
