# Complemento do Ciclo 3 — App de Oportunidades

## Objetivo

Fechar lacunas da experiência Web do Ciclo 3 sem reintroduzir o modelo divergente do antigo PR #4.

## Escopo entregue

- detalhe expandido da oportunidade;
- edição Web de campos mutáveis usando `PATCH /api/v1/opportunities/:id`;
- preservação da trava otimista por `version`;
- indicação visual baseada em `PipelineStage.kind` (`OPEN`, `WON`, `LOST`);
- bloqueio visual de movimentação em oportunidades encerradas;
- bloqueio equivalente na API para impedir reabertura de oportunidades em etapas `WON` ou `LOST`;
- cobertura automatizada Web e API.

## Decisão de arquitetura

A situação comercial continua derivada da etapa atual do funil. Não é criado um segundo campo `Opportunity.status`, evitando divergência entre status e etapa.

Uma oportunidade é considerada:

- aberta quando a etapa atual tem `kind = OPEN`;
- ganha quando a etapa atual tem `kind = WON`;
- perdida quando a etapa atual tem `kind = LOST`.

O fechamento ocorre pela movimentação controlada para uma etapa terminal. Após o fechamento, a API rejeita novas movimentações com `409 OPPORTUNITY_ALREADY_CLOSED`.

## Fora deste complemento

- reabertura de oportunidade encerrada;
- drag-and-drop obrigatório;
- novo modelo de moeda;
- motivo estruturado de perda;
- editor administrativo completo de funis e etapas.

Esses itens exigem decisão de produto própria e não devem ser introduzidos implicitamente neste complemento.
