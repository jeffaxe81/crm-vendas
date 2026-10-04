# CRM-F002 — Agenda com foco nas próximas ações

**Status: EM TESTE.** Branch: `feat/crm-agenda-focus-testing`. Não integrada ao `main`.

## Objetivo e referências

O usuário solicitou evolução baseada na utilização de CRMs de referência. Esta primeira melhoria ajuda o vendedor a encontrar retornos pendentes rapidamente, aproveitando a Agenda Comercial existente.

A pesquisa usou documentação oficial de dois produtos, sem estabelecer ranking de mercado:

- [HubSpot — filtros e visões de tarefas](https://knowledge.hubspot.com/tasks/filter-tasks-and-manage-task-views): visão de tarefas atrasadas atribuídas ao usuário.
- [Pipedrive — indicador de atividades](https://support.pipedrive.com/en/article/what-is-the-red-number-on-the-activities-icon): destaque de atividades atrasadas e previstas para hoje.

A decisão de priorizar a agenda é nossa avaliação do benefício e da lacuna encontrada no CRM: a tela existente mostrava semanas e somente os primeiros 100 registros.

## Entrega

- **Semana:** mantém navegação semanal e filtros existentes.
- **Pendentes de hoje:** tarefas e compromissos pendentes do usuário com prazo no dia local do navegador, do início ao fim do dia.
- **Atrasadas:** pendências com prazo anterior ao início de hoje, incluindo semanas anteriores. Atividades sem prazo não entram nessa visão. Um horário já passado no dia atual continua em “Pendentes de hoje”.
- Os focos mantêm filtros de tipo e prioridade. O status fica fixo em “Pendente”; o filtro semanal de status é preservado ao voltar.
- Paginação de 100 registros permite acessar resultados adicionais. Trocar filtros, foco ou semana volta à primeira página.
- **Atualizar agenda:** recarrega dados, permite tentar novamente após falhas e recalcula a data local.

A entrega utiliza a API existente de atividades, com o usuário autenticado e os controles do backend. Não altera o esquema do banco, autorização ou dados. A API usa o ID como desempate de ordenação para manter a paginação estável quando os prazos são iguais. Alterações concorrentes ainda podem modificar o conjunto de resultados entre páginas. Não envia notificações nem modifica atividades.

## Verificação

| Verificação                        | Resultado                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Frontend completo                  | 184 testes aprovados em 40 arquivos                                                             |
| Agenda no fuso America/Sao_Paulo   | 8 testes aprovados                                                                              |
| API sem testes de integração       | 93 testes aprovados em 17 suítes                                                                |
| TypeScript e build de frontend/API | Aprovados                                                                                       |
| Revisão independente               | Sem pendências relevantes após correção do desempate                                            |
| `pnpm test`                        | Interrompido no teste `compose defines the Cycle 0 service topology`: Docker ausente (`ENOENT`) |

Não foram executados testes de integração com PostgreSQL, teste visual em navegador ou build de imagens Docker. A API foi testada na fronteira de consulta usando substituto do banco; o desempate requer homologação adicional com banco real. O Node disponível é 24.19.0; o projeto declara 24.20.x.

Os testes cobrem limites do dia local, pendências anteriores, restauração de filtros, paginação, estado vazio, erro e atualização após mudança de dia.

## Homologação manual

1. Entrar no CRM com acesso à agenda; criar atividades de ontem, hoje e amanhã em Atividades.
2. Confirmar que “Pendentes de hoje” mostra somente as pendentes de hoje.
3. Confirmar que “Atrasadas” inclui pendências antigas, mas exclui concluídas, canceladas e sem prazo.
4. Combinar tipo/prioridade e alternar os três focos.
5. Validar atualização após erro e paginação quando houver mais de 100 resultados.
6. Conferir desktop e celular, incluindo os atalhos e controles de páginas.

## Próximas candidatas

Estas ideias ainda dependem de desenho e validação do código existente; não fazem parte desta entrega:

| Prioridade proposta | Melhoria                         | Benefício esperado                                            |
| ------------------- | -------------------------------- | ------------------------------------------------------------- |
| 1                   | Próxima ação na oportunidade     | Identificar negociações que precisam de retorno               |
| 2                   | Histórico unificado do cliente   | Consultar negociações, atividades e atendimentos juntos       |
| 3                   | Indicadores acionáveis no painel | Ir do indicador à lista que exige atenção                     |
| 4                   | Automações de acompanhamento     | Reduzir tarefas repetitivas após definir regras e integrações |
