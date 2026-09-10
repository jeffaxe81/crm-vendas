# C3.6.1 — Opportunity Foundation Checkpoint

## Resultado

Fundação tenant-aware de Oportunidades implementada no CRM canônico, limitada ao modelo persistente, integridade referencial e isolamento de dados. Esta microentrega não cria API REST nem interface Web.

## Base e escopo

- PR: `#15 — C3.6.1 — Opportunity tenant-aware foundation`;
- branch: `feat/c3-6-1-opportunity-foundation`;
- base da branch: `ec28da9780cf51068c95c81e47a088586601e4b3`;
- head funcional GREEN antes do fechamento documental: `6633060b66e87c43dda0aaf7a7c490f314d9c9ab`;
- workflow funcional GREEN: `34496947116`.

## Contrato entregue

- novo modelo canônico `Opportunity` em Prisma/PostgreSQL;
- isolamento por `organizationId`;
- cliente obrigatório definido por XOR entre `Company` e `Contact`;
- `estimatedValue` em `Decimal(19,2)` e não negativo;
- vínculo obrigatório com `Pipeline` e `PipelineStage` coerentes;
- responsável (`ownerUserId`) obrigado a possuir membership na organização da oportunidade;
- `version` preparado para versionamento otimista;
- `deletedAt` e `deletedBy` preparados para soft delete;
- índices tenant-aware para etapa/prazo, responsável/prazo, empresa, contato e pipeline/etapa;
- PostgreSQL RLS com `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`;
- policy fail-closed baseada em `app.current_organization_id`.

## Evidência TDD e diagnóstico

O contrato estático foi introduzido antes da implementação e permaneceu RED enquanto a migration não existia. Após a correção exclusiva de formatação dos documentos, o workflow no head `6023199b4898d76ddb85e901ef0819cbbd8ac2e1` chegou ao teste `C3.6.1 migration defines integrity and tenant isolation` e falhou somente com `expected C3.6.1 opportunity foundation migration directory`, comprovando o RED funcional esperado.

A migration foi adicionada no commit `5411da89a5d3397dc2cb58fd73f30eff97305f2a`. Esse head concluiu o workflow `34496629585` integralmente GREEN antes da inclusão dos testes adversariais.

Os testes de integração adversariais foram adicionados no commit `6633060b66e87c43dda0aaf7a7c490f314d9c9ab` e cobrem:

- ausência de visibilidade sem contexto de tenant;
- isolamento de leitura entre organizações A/B;
- criação válida de oportunidade associada a Empresa;
- criação válida de oportunidade associada a Contato;
- rejeição de escrita com organização diferente da transação tenant;
- rejeição de Company + Contact simultâneos;
- rejeição de oportunidade sem Company e sem Contact;
- rejeição de valor estimado negativo;
- rejeição de Company ou Contact de outro tenant;
- rejeição de Stage pertencente a outro Pipeline;
- rejeição de owner sem membership na organização da oportunidade.

## Testes e CI

No head funcional `6633060b66e87c43dda0aaf7a7c490f314d9c9ab`, o GitHub Actions run `34496947116` terminou GREEN no workflow completo, incluindo:

- instalação com lockfile congelado;
- geração do Prisma Client;
- deploy das migrations em PostgreSQL limpo;
- provisionamento do papel da aplicação sem bypass de RLS;
- `pnpm verify` com foundation check, Prettier, lint, typecheck, testes e builds;
- bootstrap do administrador E2E;
- instalação do Chromium;
- E2E existente;
- validação do contrato Compose;
- build das imagens de aplicação.

O head documental final deve repetir o workflow completo antes de o PR ser considerado pronto para aprovação humana.

## Limites arquiteturais preservados

Permanecem fora da C3.6.1:

- API REST de oportunidades;
- interface Web/Kanban;
- vínculo `Activity` → `Opportunity`;
- automações;
- forecast;
- produtos, propostas e comissões;
- novas permissões RBAC;
- funcionalidades das Fases 2 a 6.

A validação de membership **ativa** do owner e a validação de entidades ativas permanecem responsabilidade da futura camada de serviço da C3.6.2; a C3.6.1 garante pertencimento e coerência estrutural no banco sem antecipar comportamento de aplicação.

## Gate humano

Este checkpoint registra evidências técnicas e **não autoriza merge**. O PR #15 somente pode ser integrado à `main` depois que o workflow do head documental final terminar GREEN e houver aprovação explícita do responsável.
