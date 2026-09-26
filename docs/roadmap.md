# Roadmap do Produto

| Fase                   | Direção                                                                 | Situação                          |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| Fase 0 — Descoberta    | Finalidade comercial, escopo do MVP e documentação inicial              | Concluída para o incremento atual |
| Fase 1 — MVP Comercial | Acesso, cadastros, atividades, funil, painel e auditoria                | Release fechada — 11/09/2026      |
| Fase 2 — Produtividade | Campos personalizados, tags, agenda, importação, produtos e relatórios  | Em andamento — C4.2 Importação    |
| Fase 3 — Atendimento   | Solicitações, protocolos, filas, SLA e satisfação                       | Em desenvolvimento (branch)       |
| Fase 4 — Integrações   | API REST, webhooks, e-mail, WhatsApp, telefonia e ERP                   | Planejada                         |
| Fase 5 — Automação     | Regras, distribuição, jornadas e alertas                                | Planejada                         |
| Fase 6 — IA assistida  | Resumos, recomendações, classificação e previsões com supervisão humana | Banco de Ideias                   |

## Marco concluído

A Fase 1 — MVP Comercial foi fechada com fluxo comercial utilizável de ponta a ponta: cadastro de cliente, oportunidade, histórico/interações, atividades e acompanhamento do avanço no funil.

A evidência canônica do fechamento está registrada em `docs/releases/mvp-commercial-phase-1-2026-09-11.md`.

## Marco atual

A Fase 2 — Produtividade segue em microentregas. Já estão integradas à `develop`: C4.1 — Agenda Comercial, C4.1.1 — Resumo gerencial, C4.2.1 — Importação CSV de empresas, C4.2.2 — Importação CSV de contatos (com canais e deduplicação por e-mail) C4.2.3 — vínculo dos contatos importados a empresas existentes, C4.3 — catálogo de produtos, C4.3.1 — itens de oportunidade com valor calculado, C4.3.2 — importação CSV de produtos, C4.3.3 — edição de itens na UI com E2E, C4.4 — vendas por produto, C4.4.1 — filtros e exportação CSV, C4.4.2 — funil e conversão e C4.4.3 — atividades por responsável.

Campos personalizados e tags já existem na base atual e não serão reimplementados.

> **Próximo passo:** fechamento oficial da Fase 2 (PR `develop → main` com gate do CI e aprovação humana; ver `docs/releases/produtividade-phase-2-2026-09-25.md`). A Fase 3 — Atendimento está em desenvolvimento na branch `phase-3-atendimento` (C5.1 a C5.4 integradas, ver `docs/checkpoints/fase-3-integracao.md`) e só entra na `develop` após esse fechamento.
