# Checkpoint — Fase 4 Integrações

Data: 27/09/2026

## Estado

- fase: Fase 4 — Integrações;
- situação: design e plano criados; execução ainda não iniciada;
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
