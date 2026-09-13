# Roadmap do Produto

| Fase                   | Direção                                                                 | Situação                          |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| Fase 0 — Descoberta    | Finalidade comercial, escopo do MVP e documentação inicial              | Concluída para o incremento atual |
| Fase 1 — MVP Comercial | Acesso, cadastros, atividades, funil, painel e auditoria                | Release fechada — 11/09/2026      |
| Fase 2 — Produtividade | Campos personalizados, tags, agenda, importação, produtos e relatórios  | Em andamento — C4.2 Importação    |
| Fase 3 — Atendimento   | Solicitações, protocolos, filas, SLA e satisfação                       | Planejada                         |
| Fase 4 — Integrações   | API REST, webhooks, e-mail, WhatsApp, telefonia e ERP                   | Planejada                         |
| Fase 5 — Automação     | Regras, distribuição, jornadas e alertas                                | Planejada                         |
| Fase 6 — IA assistida  | Resumos, recomendações, classificação e previsões com supervisão humana | Banco de Ideias                   |

## Marcos concluídos

A **Fase 1 — MVP Comercial** foi fechada com fluxo comercial utilizável de ponta a ponta: cadastro de cliente, oportunidade, histórico/interações, atividades e acompanhamento do avanço no funil.

A evidência canônica do fechamento está registrada em `docs/releases/mvp-commercial-phase-1-2026-09-11.md`.

A **C4.1 — Agenda Comercial** está concluída e integrada à `main`. A agenda reutiliza o domínio `Activity` para visão semanal, navegação temporal, filtros e controle de acesso por `activity.read`.

## Marco atual

A Fase 2 — Produtividade segue pela **C4.2 — Importação**. A microentrega atual é a **C4.2.1 — Importação CSV de Empresas**, com fluxo obrigatório Preview → Confirmar, validação server-side, limite de 500 linhas, permissão `company.write`, isolamento multiempresa e auditoria pelo fluxo canônico de empresas.

Campos personalizados e tags já existem na base atual e não serão reimplementados. Após o fechamento da C4.2, os próximos blocos planejados da Fase 2 permanecem produtos e relatórios.

> **Delimitação de escopo vigente:** a C4.2.1 está em validação no PR #38. Importação de contatos, produtos, relatórios e demais evoluções continuam fora deste incremento e não serão desenvolvidos automaticamente.
