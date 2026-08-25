# Backlog do Produto

| ID | Épico | Título | Prioridade | Fase | Situação | Dependências | Esforço |
|---|---|---|---|---|---|---|---|
| MVP-01 | Acesso e segurança | Autenticação e sessão segura | P0 | 1 | Concluído no template | OAuth da plataforma | Baixo |
| MVP-02 | Acesso e segurança | Perfis e permissões básicas | P0 | 1 | Concluído | MVP-01 | Médio |
| MVP-03 | Clientes e contatos | Pessoas, empresas e contatos vinculados | P0 | 1 | Concluído | Modelo de dados | Alto |
| MVP-04 | Clientes e contatos | Consulta, filtros, edição e inativação lógica | P0 | 1 | Concluído | MVP-03 | Médio |
| MVP-05 | Histórico | Linha do tempo de interações comerciais | P0 | 1 | Concluído | MVP-03, usuário autenticado | Médio |
| MVP-06 | Atividades | Tarefas e compromissos vinculados | P0 | 1 | Concluído | MVP-03, oportunidades | Médio |
| MVP-07 | Oportunidades | Cadastro e movimentação no funil | P0 | 1 | Concluído | MVP-03 | Alto |
| MVP-08 | Painel | Indicadores e visão de trabalho diário | P1 | 1 | Concluído | MVP-06, MVP-07 | Médio |
| MVP-09 | Auditoria | Registro das ações principais | P1 | 1 | Concluído | Usuário autenticado | Médio |

## Histórias de usuário prioritárias

| ID | História de usuário | Critério resumido |
|---|---|---|
| US-01 | Como usuário, quero registrar e consultar clientes para centralizar informações comerciais. | O cadastro permite pessoa ou empresa, edição e inativação sem exclusão física. |
| US-02 | Como usuário, quero registrar interações para preservar o contexto da negociação. | A linha do tempo mostra tipo, conteúdo, data e responsável. |
| US-03 | Como usuário, quero criar tarefas associadas a clientes e oportunidades. | A tarefa possui responsável, prazo, prioridade e status. |
| US-04 | Como usuário, quero acompanhar oportunidades por etapas do funil. | A oportunidade possui cliente, valor, previsão e etapa editável. |
| US-05 | Como gestor, quero indicadores comerciais básicos para orientar prioridades. | O painel resume oportunidades por etapa, valor em aberto e atividades pendentes. |

## Delimitação do incremento

Este backlog em desenvolvimento contém somente itens da **Fase 1 — MVP Comercial**. As iniciativas das Fases 2 a 6 estão preservadas no roadmap e no Banco de Ideias como planejamento futuro; não há itens dessas fases em implementação, testes de aceitação ou código neste incremento.
