# Checkpoint — Fase 3 Atendimento

Data: 24/09/2026

## Estado

- fase: Fase 3 — Atendimento;
- situação: autorizada para execução autônoma;
- branch documental inicial: `docs/phase-3-atendimento`;
- base da branch: `main` @ `d418c7f63e7a2f49475ff58563b64bd1720835bb`;
- design: `docs/superpowers/specs/2026-09-24-phase-3-atendimento-design.md`;
- plano: `docs/superpowers/plans/2026-09-24-phase-3-atendimento.md`.

## Autorização

Foi autorizada a continuidade autônoma da Fase 3 dentro do projeto `jeffaxe81/crm-vendas`.

A autonomia cobre:

- planejamento técnico;
- divisão em microentregas;
- criação de branches;
- implementação;
- testes;
- documentação;
- abertura e atualização de PRs Draft;
- correções necessárias para manter gates técnicos.

Permanece preservado o princípio de não degradar a `main`: nenhuma microentrega deve ser considerada integrada apenas por existir em branch ou PR.

## Objetivo da fase

Adicionar Atendimento ao CRM por meio de:

- solicitações;
- protocolo;
- interações;
- filas;
- SLA;
- interface operacional;
- satisfação;
- relatórios básicos.

## Primeira microentrega

A execução deve começar por **F3.1 — Fundação Solicitação/Protocolo**.

A F3.1 deverá provar antes de qualquer expansão:

- modelo tenant-aware;
- protocolo seguro e único;
- RLS fail-closed;
- isolamento entre tenants;
- integridade de referências Empresa/Contato;
- base para concorrência otimista;
- migration reproduzível.

## Barra de progresso

- [x] autorização da Fase 3;
- [x] design canônico;
- [x] plano de implementação;
- [x] delimitação de escopo;
- [x] estratégia de segurança;
- [x] estratégia de RBAC;
- [x] ordem de microentregas;
- [ ] F3.1 — Fundação Solicitação/Protocolo;
- [ ] F3.2 — API de Solicitações;
- [ ] F3.3 — Interações e Timeline;
- [ ] F3.4 — Filas;
- [ ] F3.5 — SLA;
- [ ] F3.6 — Web de Atendimento;
- [ ] F3.7 — Satisfação;
- [ ] F3.8 — Relatórios/E2E/Release.

## Restrições vigentes

- não iniciar Fase 4 por antecipação;
- não integrar WhatsApp/e-mail/telefonia nesta fase;
- não introduzir IA;
- não aceitar tenant do payload;
- não remover RLS;
- não usar `BYPASSRLS`;
- não substituir auditoria canônica;
- não reescrever histórico da Fase 1 ou Fase 2;
- não tratar documentação aspiracional antiga como código já entregue.

## Gate operacional

Cada microentrega deve manter:

- TDD quando houver comportamento novo;
- isolamento multi-tenant;
- RBAC;
- auditoria;
- migration reproduzível quando aplicável;
- testes direcionados;
- regressão;
- quality gate;
- PR Draft durante desenvolvimento.

## Próximo passo técnico

Criar branch de implementação da F3.1 a partir da `main` atual e iniciar pelo teste RED do contrato/modelo tenant-aware de `ServiceRequest`.
