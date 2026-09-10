# C3.5.3 — Vínculos comerciais de atividades

## Resultado

A microentrega formaliza o estado dos vínculos comerciais de `Activity` e evita criar dependências artificiais para cumprir a sequência do roadmap.

## Atendido

- `Activity.companyId` possui relação canônica com `Company`;
- `Activity.contactId` possui relação canônica com `Contact`;
- ambos os vínculos são opcionais e possuem índices tenant-aware;
- a API da C3.5.2 valida referências dentro da organização ativa;
- empresa/contato inativos ou pertencentes a outro tenant são rejeitados sem vazamento de existência;
- listagens de atividades aceitam filtros por empresa e contato.

## Dependência formalmente diferida

O vínculo `Activity` → `Opportunity` não é criado nesta etapa porque o domínio canônico `Opportunity` ainda não existe. Quando oportunidades forem implementadas, o vínculo deverá usar FK/relação Prisma real e isolamento tenant-aware, nunca um identificador solto ou referência genérica.

## Alterações de produção

Nenhuma. Esta microentrega é deliberadamente documental/arquitetural e preserva schema, migrations, API e RBAC já homologados.

## Próximo passo

C3.5.4 — Web de Atividades, reutilizando a API tenant-aware entregue na C3.5.2.

## Gate de integração

O PR desta decisão deve passar pelo gate completo do repositório. A aprovação técnica desta documentação não autoriza merge automático; a integração à `main` permanece condicionada à aprovação explícita do responsável.
