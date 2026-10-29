# Dashboard Gate 0 Break-Glass Policy — Design

## Intent

Fechar a definição técnica da política de sessão privilegiada de emergência da issue #256 sem criar nem habilitar uma sessão break-glass.

## Goals

- manter política versionada e verificável;
- exigir MFA, segundo aprovador distinto, escopo explícito, expiração curta e auditoria;
- rejeitar autoaprovação, duração excessiva, escopo curinga e estados que aleguem aprovação;
- manter o resultado sempre fail-closed para liberação de produção.

## Non-goals

- não criar endpoint de impersonation;
- não conceder permissões;
- não executar homologação externa;
- não substituir aprovação jurídica, operacional ou humana.

## Approach

Manifesto JSON + validador Node puro. O validador aceita somente estado de política/documentação e retorna `breakGlassEnabled: false` e `productionApproved: false`. Qualquer ausência ou relaxamento dos controles obrigatórios invalida o registro.

## Acceptance

Testes adversariais cobrem MFA ausente, aprovadores iguais, escopo amplo, TTL inválido, auditoria ausente e estados forjados de aprovação.
