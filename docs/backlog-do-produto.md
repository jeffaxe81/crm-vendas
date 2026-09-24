# Backlog do Produto

| ID     | Épico               | Título                                        | Prioridade | Fase | Situação              | Dependências                | Esforço |
| ------ | ------------------- | --------------------------------------------- | ---------- | ---- | --------------------- | --------------------------- | ------- |
| MVP-01 | Acesso e segurança  | Autenticação e sessão segura                  | P0         | 1    | Concluído no template | OAuth da plataforma         | Baixo   |
| MVP-02 | Acesso e segurança  | Perfis e permissões básicas                   | P0         | 1    | Concluído             | MVP-01                      | Médio   |
| MVP-03 | Clientes e contatos | Pessoas, empresas e contatos vinculados       | P0         | 1    | Concluído             | Modelo de dados             | Alto    |
| MVP-04 | Clientes e contatos | Consulta, filtros, edição e inativação lógica | P0         | 1    | Concluído             | MVP-03                      | Médio   |
| MVP-05 | Histórico           | Linha do tempo de interações comerciais       | P0         | 1    | Concluído             | MVP-03, usuário autenticado | Médio   |
| MVP-06 | Atividades          | Tarefas e compromissos vinculados             | P0         | 1    | Concluído             | MVP-03, oportunidades       | Médio   |
| MVP-07 | Oportunidades       | Cadastro e movimentação no funil              | P0         | 1    | Concluído             | MVP-03                      | Alto    |
| MVP-08 | Painel              | Indicadores e visão de trabalho diário        | P1         | 1    | Concluído             | MVP-06, MVP-07              | Médio   |
| MVP-09 | Auditoria           | Registro das ações principais                 | P1         | 1    | Concluído             | Usuário autenticado         | Médio   |
| F2-01  | Produtividade       | Agenda Comercial semanal                      | P0         | 2    | Concluído             | MVP-06, activity.read       | Médio   |
| F2-02  | Produtividade       | Resumo gerencial (C4.1.1)                     | P1         | 2    | Concluído             | MVP-07, MVP-08              | Médio   |
| F2-03  | Importação          | Importação CSV de empresas (C4.2.1)           | P0         | 2    | Concluído             | company.write               | Médio   |
| F2-04  | Importação          | Importação CSV de contatos (C4.2.2)           | P0         | 2    | Concluído             | contact.write, F2-03        | Médio   |
| F2-05  | Importação          | Vínculo de contatos importados a empresas     | P1         | 2    | Concluído             | F2-03, F2-04                | Baixo   |
| F2-06  | Produtos            | Catálogo de produtos                          | P1         | 2    | Aguardando definição  | Modelo de dados novo        | Alto    |

## Histórias de usuário prioritárias

| ID    | História de usuário                                                                         | Critério resumido                                                                |
| ----- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| US-01 | Como usuário, quero registrar e consultar clientes para centralizar informações comerciais. | O cadastro permite pessoa ou empresa, edição e inativação sem exclusão física.   |
| US-02 | Como usuário, quero registrar interações para preservar o contexto da negociação.           | A linha do tempo mostra tipo, conteúdo, data e responsável.                      |
| US-03 | Como usuário, quero criar tarefas associadas a clientes e oportunidades.                    | A tarefa possui responsável, prazo, prioridade e status.                         |
| US-04 | Como usuário, quero acompanhar oportunidades por etapas do funil.                           | A oportunidade possui cliente, valor, previsão e etapa editável.                 |
| US-05 | Como gestor, quero indicadores comerciais básicos para orientar prioridades.                | O painel resume oportunidades por etapa, valor em aberto e atividades pendentes. |
| US-06 | Como usuário comercial, quero visualizar minhas atividades em uma agenda semanal.           | A agenda usa dueAt, navegação semanal, filtros e respeita activity.read.         |

## Delimitação do incremento

A **Fase 1 — MVP Comercial** está encerrada. Na **Fase 2 — Produtividade** já foram entregues a Agenda Comercial (C4.1), o Resumo gerencial (C4.1.1) e as importações CSV de empresas (C4.2.1) e de contatos (C4.2.2). O vínculo de contatos importados a empresas (C4.2.3) também foi entregue, encerrando o bloco de Importação. O próximo bloco é Produtos, que depende de definição de escopo.

Campos personalizados e tags já estão presentes na base atual e não serão duplicados. Importação, produtos, relatórios e demais evoluções continuam planejados para incrementos posteriores.
