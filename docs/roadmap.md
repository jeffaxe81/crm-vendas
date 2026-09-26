# Roadmap do Produto

| Fase                   | Direção                                                                 | Situação                                      |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| Fase 0 — Descoberta    | Finalidade comercial, escopo do MVP e documentação inicial              | Concluída para o incremento atual             |
| Fase 1 — MVP Comercial | Acesso, cadastros, atividades, funil, painel e auditoria                | Release fechada — 11/09/2026                  |
| Fase 2 — Produtividade | Campos personalizados, tags, agenda, importação, produtos e relatórios  | Fechamento em andamento (PR `develop → main`) |
| Fase 3 — Atendimento   | Solicitações, protocolos, filas, SLA e satisfação                       | Autorizada — preparação F3.1                  |
| Fase 4 — Integrações   | API REST, webhooks, e-mail, WhatsApp, telefonia e ERP                   | Planejada                                     |
| Fase 5 — Automação     | Regras, distribuição, jornadas e alertas                                | Planejada                                     |
| Fase 6 — IA assistida  | Resumos, recomendações, classificação e previsões com supervisão humana | Banco de Ideias                               |

## Marco concluído

A Fase 1 — MVP Comercial foi fechada com fluxo comercial utilizável de ponta a ponta: cadastro de cliente, oportunidade, histórico/interações, atividades e acompanhamento do avanço no funil.

A evidência canônica do fechamento está registrada em `docs/releases/mvp-commercial-phase-1-2026-09-11.md`.

## Fase 2 — Produtividade

A Fase 2 — Produtividade segue em microentregas. Já estão integradas à `develop`: C4.1 — Agenda Comercial, C4.1.1 — Resumo gerencial, C4.2.1 — Importação CSV de empresas, C4.2.2 — Importação CSV de contatos (com canais e deduplicação por e-mail), C4.2.3 — vínculo dos contatos importados a empresas existentes, C4.3 — catálogo de produtos, C4.3.1 — itens de oportunidade com valor calculado, C4.3.2 — importação CSV de produtos, C4.3.3 — edição de itens na UI com E2E, C4.4 — vendas por produto, C4.4.1 — filtros e exportação CSV, C4.4.2 — funil e conversão, C4.4.3 — atividades por responsável, C4.5 — vendas por vendedor, C4.6 — vendas por período mensal e C4.1.6 — Territory Management (territórios, cobertura e cotas).

Campos personalizados e tags já existem na base atual e não serão reimplementados.

> **Próximo passo:** fechamento oficial da Fase 2 (PR `develop → main` com gate do CI e aprovação humana; ver `docs/releases/produtividade-phase-2-2026-09-26-ampliada.md`).

## Fase 3 — Atendimento

Em 24/09/2026 foi autorizada a preparação e execução autônoma da Fase 3 — Atendimento.

A fase será executada de forma incremental:

1. F3.1 — Fundação Solicitação/Protocolo;
2. F3.2 — API de Solicitações;
3. F3.3 — Interações e Timeline;
4. F3.4 — Filas;
5. F3.5 — SLA;
6. F3.6 — Web de Atendimento;
7. F3.7 — Satisfação;
8. F3.8 — Relatórios, E2E e Release.

A arquitetura detalhada está registrada em `docs/superpowers/specs/2026-09-24-phase-3-atendimento-design.md`.

A continuidade da Fase 2 deve preservar as microentregas já validadas e não bloquear a preparação arquitetural independente da Fase 3.

## Limites entre fases

A Fase 3 registra atendimento e operação interna. Integrações automáticas com e-mail, WhatsApp, telefonia, ERP e webhooks pertencem à Fase 4.

Motor de regras e automações genéricas pertencem à Fase 5.

IA/RAG, classificação automática, recomendações e previsões pertencem à Fase 6.

Essa separação evita acoplamento prematuro e mantém a evolução testável por microentregas.
