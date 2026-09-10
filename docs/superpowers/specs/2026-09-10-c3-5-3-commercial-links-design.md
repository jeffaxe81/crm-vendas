# C3.5.3 — Vínculos comerciais de atividades

## Objetivo

Formalizar os vínculos comerciais do domínio `Activity` sem introduzir referências frágeis ou antecipar o domínio canônico de oportunidades.

## Estado atual

A C3.5.1 criou `Activity` com vínculos opcionais reais para `Company` e `Contact`, e a C3.5.2 expôs esses vínculos pela API com validação tenant-aware, filtragem e proteção contra referências cross-tenant.

O domínio canônico `Opportunity` ainda não existe na arquitetura Prisma/PostgreSQL atual. Embora o RF-07 exija tarefas e compromissos vinculados a clientes e oportunidades, os RF-08 e RF-09 ainda dependem da futura implementação do domínio de oportunidades.

## Decisão

### Company e Contact

Os vínculos de `Activity` com `Company` e `Contact` são considerados atendidos para a C3.5.3 porque:

- usam chaves estrangeiras reais;
- são opcionais;
- são isolados por organização via RLS e contexto tenant-aware;
- a API valida que empresa e contato pertencem ao tenant ativo e não estão inativados;
- a API permite filtrar atividades por `companyId` e `contactId`;
- tentativas de referência cross-tenant não revelam a existência do recurso.

### Opportunity

O vínculo com `Opportunity` fica formalmente diferido até que exista um domínio canônico `Opportunity`.

Quando esse domínio for implementado, `Activity` deverá receber um `opportunityId` opcional com relação Prisma/FK real, índices tenant-aware e validação dentro do mesmo tenant. O vínculo não poderá ser implementado como UUID/string sem FK, referência genérica polimórfica ou consulta cruzada sem contrato de domínio.

## Alternativas rejeitadas

1. Criar agora uma entidade `Opportunity` mínima apenas para atender `Activity`: rejeitado porque anteciparia regras de negócio de valor, previsão, etapa, fechamento e movimentação sem desenho próprio.
2. Adicionar `opportunityId` sem FK: rejeitado por perder integridade referencial e ampliar risco de vazamento cross-tenant.
3. Usar vínculo genérico `entityType/entityId`: rejeitado por enfraquecer o contrato do domínio, dificultar RLS e transferir validação para código aplicativo.

## Impacto na linha do tempo

A C3.5.3 encerra sem código novo de produção. Company/Contact permanecem como implementação canônica já entregue; Opportunity permanece como dependência explícita do futuro domínio de oportunidades.

A próxima microentrega da linha 3.5 é a C3.5.4 — Web de Atividades.

## Critérios de integração

- nenhuma alteração em schema, migration, API ou permissões;
- spec, checkpoint e changelog coerentes com o estado da `main`;
- gate de CI integral GREEN no head final do PR;
- merge somente após aprovação explícita do responsável.
