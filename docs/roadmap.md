# Roadmap do Produto

| Fase                   | Direção                                                                 | Situação                                                   |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Fase 0 — Descoberta    | Finalidade comercial, escopo do MVP e documentação inicial              | Concluída para o incremento atual                          |
| Fase 1 — MVP Comercial | Acesso, cadastros, atividades, funil, painel e auditoria                | Release fechada — 11/09/2026                               |
| Fase 2 — Produtividade | Campos personalizados, tags, agenda, importação, produtos e relatórios  | Concluída — mesclada em `main` (26/09/2026)                |
| Fase 3 — Atendimento   | Solicitações, protocolos, filas, SLA e satisfação                       | Concluída — mesclada em `main` (27/09/2026)                |
| Fase 4 — Integrações   | API pública, webhooks, e-mail, WhatsApp, telefonia e ERP                | Autorizada — design e plano criados, execução não iniciada |
| Fase 5 — Automação     | Regras, distribuição, jornadas e alertas                                | Planejada                                                  |
| Fase 6 — IA assistida  | Resumos, recomendações, classificação e previsões com supervisão humana | Banco de Ideias                                            |

## Marco concluído

A Fase 1 — MVP Comercial foi fechada com fluxo comercial utilizável de ponta a ponta: cadastro de cliente, oportunidade, histórico/interações, atividades e acompanhamento do avanço no funil.

A evidência canônica do fechamento está registrada em `docs/releases/mvp-commercial-phase-1-2026-09-11.md`.

## Fase 2 — Produtividade

A Fase 2 — Produtividade segue em microentregas. Já estão integradas à `develop`: C4.1 — Agenda Comercial, C4.1.1 — Resumo gerencial, C4.2.1 — Importação CSV de empresas, C4.2.2 — Importação CSV de contatos (com canais e deduplicação por e-mail), C4.2.3 — vínculo dos contatos importados a empresas existentes, C4.3 — catálogo de produtos, C4.3.1 — itens de oportunidade com valor calculado, C4.3.2 — importação CSV de produtos, C4.3.3 — edição de itens na UI com E2E, C4.4 — vendas por produto, C4.4.1 — filtros e exportação CSV, C4.4.2 — funil e conversão, C4.4.3 — atividades por responsável, C4.5 — vendas por vendedor, C4.6 — vendas por período mensal e C4.1.6 — Territory Management (territórios, cobertura e cotas).

Campos personalizados e tags já existem na base atual e não serão reimplementados.

> **Próximo passo:** iniciar F4.1 — Fundação de Credenciais e API Pública (ver `docs/superpowers/plans/2026-09-27-phase-4-integracoes.md`), com o mesmo rigor de verificação usado no fechamento das Fases 2 e 3 antes de qualquer merge na `main`.

## Fase 3 — Atendimento

A Fase 3 — Atendimento foi concluída e mesclada em `main` em 27/09/2026, com quality gate completo (lint, typecheck, testes de integração reais, E2E e build de imagens) verde.

Foi executada de forma incremental:

1. F3.1 — Fundação Solicitação/Protocolo;
2. F3.2 — API de Solicitações;
3. F3.3 — Interações e Timeline;
4. F3.4 — Filas;
5. F3.5 — SLA;
6. F3.6 — Web de Atendimento;
7. F3.7 — Satisfação;
8. F3.8 — Relatórios, E2E e Release.

A arquitetura detalhada está registrada em `docs/superpowers/specs/2026-09-24-phase-3-atendimento-design.md`.

## Fase 4 — Integrações

Em 27/09/2026 foi criado o design e o plano de execução da Fase 4 — Integrações. A execução ainda não começou.

A fase será executada de forma incremental:

1. F4.1 — Fundação de Credenciais e API Pública;
2. F4.2 — Webhooks de Saída;
3. F4.3 — E-mail Transacional;
4. F4.4 — WhatsApp Business;
5. F4.5 — Telefonia/CTI;
6. F4.6 — Sincronização com ERP;
7. F4.7 — Observabilidade, E2E e Release.

A arquitetura detalhada está registrada em `docs/superpowers/specs/2026-09-27-phase-4-integracoes-design.md` e o plano de execução em `docs/superpowers/plans/2026-09-27-phase-4-integracoes.md`.

Diferente das Fases 1–3, a Fase 4 expõe endpoints públicos e credenciais de máquina-a-máquina, exigindo revisão adicional de SSRF, verificação de assinatura de provedor e idempotência em todo canal de entrada.

## Limites entre fases

A Fase 3 registra atendimento e operação interna. Integrações automáticas com e-mail, WhatsApp, telefonia, ERP e webhooks pertencem à Fase 4.

Motor de regras e automações genéricas pertencem à Fase 5.

IA/RAG, classificação automática, recomendações e previsões pertencem à Fase 6.

Essa separação evita acoplamento prematuro e mantém a evolução testável por microentregas.
