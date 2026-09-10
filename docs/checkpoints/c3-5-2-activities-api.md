# C3.5.2 — API tenant-aware de Atividades

## Escopo entregue

A microentrega expõe o domínio canônico `Activity` pela API REST com criação,
listagem, consulta, atualização/transição de status e soft delete.

## Contratos e segurança

- RBAC: `activity.read` para leitura e `activity.write` para mutações;
- isolamento por organização preservado por `PrismaService.withTenant` e RLS da
  C3.5.1;
- empresa e contato são validados dentro do tenant e precisam estar ativos;
- responsável precisa possuir membership ativa na organização;
- acesso ou referência cross-tenant retorna `404`, sem revelar existência;
- `completedAt` e `cancelledAt` são controlados pelo servidor;
- auditoria cobre criação, atualização, conclusão, cancelamento e exclusão
  lógica.

## TDD

O RED funcional foi observado antes da implementação: o teste da API alcançou
`POST /api/v1/activities` e recebeu `404` quando esperava `201`, enquanto
formatação, lint e typecheck já estavam aprovados.

Após a implementação mínima, o SHA
`664793090bb17563cf1d79924df1e5bb3fa9bc63` passou integralmente por source e
tests, E2E, validação de Compose e build das imagens no GitHub Actions.

## Fora de escopo

Web, calendário/agenda, recorrência, notificações, automação de follow-up,
integrações Google/Outlook e vínculo com Opportunity permanecem para etapas
posteriores.

## Gate de integração

Este checkpoint não autoriza merge. O head final do PR deve passar novamente o
gate integral após a documentação, e a integração à `main` permanece
condicionada à aprovação explícita do responsável.
