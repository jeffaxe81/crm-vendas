# Checkpoint — Fase 4 Integrações

Data: 09/10/2026

## Estado

- fase: Fase 4 — Integrações;
- situação: fundação de credenciais/API pública integrada; demais canais pendentes;
- base: `main` @ `d1f0fa0` (Fase 1 + Fase 2 + Fase 3 fechadas com quality gate verde);
- design: `docs/superpowers/specs/2026-09-27-phase-4-integracoes-design.md`;
- plano: `docs/superpowers/plans/2026-09-27-phase-4-integracoes.md`.

## Objetivo da fase

Abrir o CRM para sistemas externos, preservando o isolamento multi-tenant homologado:

- API pública por chave (`IntegrationCredential`);
- webhooks de saída assinados (`WebhookSubscription`/`WebhookDelivery`);
- e-mail transacional (envio e recebimento);
- WhatsApp Business (envio e recebimento);
- telefonia/CTI (`CallEvent`);
- sincronização com ERP (`ErpSyncJob`).

## Microentregas planejadas

| Item | Escopo                                | Status                                    |
| ---- | ------------------------------------- | ----------------------------------------- |
| F4.1 | Fundação de credenciais e API pública | ✅ Concluída — PR #76, gate verde (21/21) |
| F4.2 | Webhooks de saída                     | Não iniciada                              |
| F4.3 | E-mail transacional                   | Não iniciada                              |
| F4.4 | WhatsApp Business                     | Não iniciada                              |
| F4.5 | Telefonia/CTI                         | Não iniciada                              |
| F4.6 | Sincronização com ERP                 | Não iniciada                              |
| F4.7 | Observabilidade, E2E e Release        | Não iniciada                              |

## Riscos específicos desta fase

Diferente das Fases 1–3, a Fase 4 expõe endpoints públicos e credenciais de máquina-a-máquina. Além da revisão de isolamento multi-tenant já padrão, cada microentrega com canal de entrada/saída externo exige revisão específica de:

- SSRF (webhooks de saída);
- verificação de assinatura do provedor (WhatsApp, e-mail, CTI);
- idempotência por identificador externo único;
- escopo de credencial nunca superior ao do criador.

## Próximo passo

Iniciar F4.2 — Webhooks de Saída, seguindo a regra de execução do plano (branch a partir da `main`, TDD, gate completo antes de qualquer merge).

## Continuidade dos ciclos 5 e 6 — 09/10/2026

Na nomenclatura usada na continuidade do projeto, C5 corresponde ao Atendimento
e C6 às Integrações. Este C6 é a Fase 4 do roadmap canônico; o documento antigo
`CYCLE_6_PLAN.md` de analytics/ML não é a especificação desta entrega.

O incremento de C6 completa a interface da fundação F4.1: listagem,
criação com escopos permitidos, expiração opcional, exibição única do segredo
e revogação confirmada, usando a API existente. Acrescenta também o modo
`NEO_INTERACT_MODE=tab` e os limites de tamanho do iframe.

Guias: [chaves de integração](../features/crm-integration-credentials.md) e
[configuração NEO](../features/crm-communication-iframe.md). O avanço e as
evidências de verificação estão no checkpoint datado desta continuidade.

Webhooks, e-mail, WhatsApp, CTI e ERP continuam pendentes. SSO e sincronização
NEO dependem de documentação e acesso ao ambiente externo. White-label e
reset de dados de teste permanecem no escopo posterior; este incremento não
executa exclusão nem restauração de banco.
