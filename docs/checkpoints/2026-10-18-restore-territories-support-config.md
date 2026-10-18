# CRM — territórios, filas e SLA no executor interno

## Escopo

Base: `main` em `321e2f19ea42467668d06cc744277cd44a15c8c7`, após as PRs
#243 e #257. Entrega e evidências de integração:
[PR #258](https://github.com/jeffaxe81/crm-vendas/pull/258).
Continuação da Task 4 do [plano aprovado de backup](../superpowers/plans/2026-10-05-crm-backup.md)
e da [meta de quatro meses](../superpowers/plans/2026-10-18-four-month-crm-acceleration.md).

O executor interno acrescenta seis modelos aos 14 anteriores:

| Modelos            | Dados recuperados                                                  |
| ------------------ | ------------------------------------------------------------------ |
| `Territory`        | Território, região, representante opcional e exclusão lógica.      |
| `TerritoryQuota`   | Cotas de vendas e valores realizados, com ano e índice do período. |
| `TerritoryTarget`  | Empresas vinculadas ao território e estado de cobertura.           |
| `TerritoryMetrics` | Métricas armazenadas, percentuais, receita e data de atualização.  |
| `SupportQueue`     | Filas, flags de atividade/atribuição e exclusão lógica.            |
| `SlaPolicy`        | Políticas por prioridade, prazos e atividade.                      |

A alteração de produção amplia somente a lista explícita de modelos revisados.
Os tipos, o formato de backup e o mecanismo de substituição permanecem os já
implementados. Não há migração nem dependência nova. Territórios precedem suas
cotas, vínculos e métricas na inserção; a exclusão segue a ordem inversa.

## Validação

Os 34 testes unitários direcionados da base passaram. Antes da implementação,
sete regressões unitárias novas falharam: seis coleções ausentes eram tratadas
apenas como referência inválida e o novo conjunto continuava marcado como não
suportado. O [CI RED 39120046691](https://github.com/jeffaxe81/crm-vendas/actions/runs/39120046691)
confirmou 29 falhas esperadas sobre a versão anterior: 22 em PostgreSQL e sete
unitárias. Os outros 930 testes de API passaram. Após ampliar a lista revisada,
os 40 testes unitários direcionados e as checagens de tipos locais passaram.
A revisão independente não encontrou achados críticos ou importantes no código.
O CI completo do candidato final é condição para merge; o PR registra os runs
de execução e seus SHAs.

Os 24 casos novos de PostgreSQL/RLS usam cópias reais criptografadas e verificadas:

- 15 de territórios: snapshot completo exato, cópia autenticamente vazia,
  quatro FKs ausentes, quatro IDs existentes em outro tenant e cinco falhas
  tardias de constraints de cotas. As rejeições de referência são inspecionadas
  dentro da mesma transação, antes que um rollback possa esconder uma exclusão.
- Nove de filas/SLA: round-trip completo, cópia vazia, usuário histórico removido,
  duas FKs de auditoria ausentes, dois rollbacks por constraints e dois bloqueios
  de chamado presente somente no estado atual ou somente na cópia.

Precisão coberta pelos testes: Decimal(19,2) até `99999999999999999.99`,
Decimal(5,2) das métricas e seis dígitos de microssegundos. Os períodos reais são
`MONTH`, `QUARTER` e `YEAR`; índices zero legados e subdivisões válidas são
recuperados. O índice parcial de filas considera o nome sem distinguir caixa e
inclui filas inativas; somente registros com exclusão lógica ficam fora dele.
Senhas e privilégios atuais, inclusive um privilégio reduzido após a cópia,
e dados de outro tenant permanecem preservados.

## Limites e próximos passos

O total interno passa a 20 modelos. Oito modelos organizacionais `REPLACE`
continuam bloqueando a execução quando tiverem dados em qualquer lado:
`Role`, `RolePermission`, `CustomFieldDefinition`, `CompanyCustomFieldValue`,
`ContactCustomFieldValue`, `Ticket`, `TicketEvent` e `UserWorkspacePreference`.
A configuração da raiz `Organization` e as políticas especiais também exigem
implementação específica. Um chamado vinculado à fila bloqueia sua substituição
antes da primeira exclusão.

O executor permanece interno. Cópia preventiva real, confirmação/auditoria e
revogação de sessões na mesma orquestração ainda precisam ser integradas antes
da API/UI de restore completo, conforme [#250](https://github.com/jeffaxe81/crm-vendas/issues/250)
e o [gate técnico](../deploy/restore-confirmation-gate.md).
Homologação [#255](https://github.com/jeffaxe81/crm-vendas/issues/255)/
[#159](https://github.com/jeffaxe81/crm-vendas/issues/159) e o gate de dashboards
[#256](https://github.com/jeffaxe81/crm-vendas/issues/256) continuam independentes.
Esta sessão não executa operações em dados reais nem implantação no servidor.
