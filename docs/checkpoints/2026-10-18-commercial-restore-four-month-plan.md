# CRM — grafo comercial interno e meta de quatro meses

## Escopo desta entrega

Base: `main` em `85dbae0d5b08a7a84a2afa9b79aaf24012e6ddfd`, após #253.
Implementação e evidências de integração: [PR #257](https://github.com/jeffaxe81/crm-vendas/pull/257).
Plano: [quatro blocos mensais nominais](../superpowers/plans/2026-10-18-four-month-crm-acceleration.md).

O executor interno acrescenta `Product`, `Opportunity`, `OpportunityItem` e
`Activity` aos dez modelos já implementados. A remoção usa a ordem inversa das
dependências e a inserção começa pelos pais. Todo o trabalho ocorre na transação
de manutenção exclusiva e com isolamento de snapshot já exigida pelo executor.

- `Decimal` chega ao PostgreSQL como string, incluindo valores além da precisão
  inteira do JavaScript. Entrada numérica nesses campos é rejeitada previamente.
- Timestamps mantêm os seis dígitos de microssegundos; enums seguem o mapeamento
  de metadados revisado.
- Referências do snapshot, identidades atuais e associações atuais dos responsáveis
  pelas oportunidades são verificadas antes da primeira exclusão. A associação é
  procurada por organização e usuário; seu ID histórico pode ter sido recriado.
- Modelos `REPLACE` ainda não implementados bloqueiam a execução se contiverem
  dados no backup ou no tenant atual. `Ticket` continua coberto pelos testes de recusa.
- Usuários, senhas, associações, privilégios, sessões e credenciais atuais são
  preservados. Este incremento não restaura a configuração de `Organization`.

## Evidências e revisão

O [CI RED 39097655012](https://github.com/jeffaxe81/crm-vendas/actions/runs/39097655012)
executou os testes novos sobre a implementação anterior: 18 falhas esperadas,
sendo 11 no PostgreSQL e sete nos testes unitários. As falhas demonstraram que o
grafo comercial ainda era recusado e que as novas coleções não eram exigidas.
Os outros testes de API desse run passaram: 457 no primeiro shard e 449 no segundo.

A revisão independente identificou que um usuário global existente, mas sem a
associação atual à organização, poderia chegar ao primeiro `DELETE` antes de
falhar pela FK. Três testes unitários reproduziram essa lacuna antes da correção;
depois da correção, os 34 testes locais direcionados passaram. Os testes PostgreSQL
acrescentam os casos de associação removida e recriada, preservando os privilégios
atuais.

Os 15 casos PostgreSQL do novo arquivo cobrem:

- Backup real criptografado e verificado, alteração posterior e round-trip de todo
  o snapshot; preços, quantidades fracionárias, enums e microssegundos exatos.
- Remoção do grafo atual ao restaurar uma cópia autenticamente vazia.
- Cinco referências ausentes e três IDs existentes em outro tenant, com inspeção
  na mesma transação para que rollback não oculte uma exclusão prematura.
- Associação removida ou recriada para o responsável; segurança atual preservada.
- Rollback integral por falha tardia na constraint de quantidade de um item.
- Recusa de `Ticket` presente somente na cópia ou somente no estado atual.

O CI completo do candidato deve passar antes do merge. O PR registra o SHA, os
resultados e o run de integração; este documento não promove o run RED a aceite.
O PostgreSQL, o navegador e os containers são verificados no CI, pois não estão
disponíveis no ambiente local desta sessão. Nenhum desses testes usa dados reais.

## Limites e próximos gates

O executor permanece sem rota HTTP, botão ou operação de worker. A restauração
completa de [#250](https://github.com/jeffaxe81/crm-vendas/issues/250) ainda exige
os demais modelos, políticas especiais, cópia preventiva verificada, orquestração
atômica da confirmação/auditoria/revogação de sessões e homologação apropriada.
Consulte o [gate de restauração](../deploy/restore-confirmation-gate.md).

A revisão e correção do laboratório sintético [#243](https://github.com/jeffaxe81/crm-vendas/pull/243)
é uma frente independente desta entrega. CI e laboratório não comprovam execução
no servidor. [#255](https://github.com/jeffaxe81/crm-vendas/issues/255) e
[#159](https://github.com/jeffaxe81/crm-vendas/issues/159) continuam exigindo ambiente
e operador autorizados; dashboards continuam sujeitos a
[#256](https://github.com/jeffaxe81/crm-vendas/issues/256).

Os quatro meses são uma meta de antecipação do planejamento. Não representam
tempo transcorrido, meses trabalhados ou data garantida de produção.
