# C3 — Loss Reason Completion

## Objetivo

Fechar a lacuna de SAL-004 no Cycle 3: toda oportunidade encerrada como perdida deve registrar um motivo de perda estruturado e auditável.

## Regras

- `Opportunity.lossReason` é nullable enquanto a oportunidade não estiver perdida.
- mover uma oportunidade para uma etapa `LOST` exige `lossReason` não vazio, com até 500 caracteres;
- enviar `lossReason` ao mover para uma etapa `OPEN` ou `WON` é rejeitado;
- criar diretamente em uma etapa `LOST` também exige `lossReason`;
- criar em etapa não `LOST` com `lossReason` é rejeitado;
- oportunidades já `WON/LOST` continuam sem reabertura;
- o motivo é retornado na API e incluído em auditoria;
- isolamento multiempresa, RLS e concorrência otimista permanecem inalterados.

## Escopo técnico

1. contrato compartilhado de create/move;
2. coluna `loss_reason` em `opportunities`;
3. migration versionada;
4. validação transacional no serviço;
5. resposta pública/auditoria;
6. Web solicita motivo antes de mover para LOST;
7. testes API/Web/E2E e gate completo.

## Fora de escopo

- catálogo administrável de motivos;
- reabertura;
- automações;
- IA;
- alteração do modelo de estágio.
