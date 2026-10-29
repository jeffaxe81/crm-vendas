# Quatro entregas paralelas de produtividade

Base: `main@3a472f7c`. Quatro tarefas foram desenvolvidas simultaneamente em worktrees e commits independentes e depois reunidas em `feat/crm-four-productivity-deliveries-20261029`.

| Tarefa        | Resultado                                                                                                               | Verificação direcionada                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Contatos      | Carregar páginas adicionais, preservar filtros e exportação, ignorar respostas antigas e proteger refresh de importação | 15 testes em 5 arquivos                       |
| Atividades    | Carregar páginas adicionais com query/status preservados e descarte de respostas após filtros, sessão ou mutações       | 19 testes em 3 arquivos                       |
| Oportunidades | Carregar páginas adicionais na coleção usada pela lista e Kanban, com deduplicação e tentativa após falha               | 21 testes em 6 arquivos                       |
| Produtos      | Exportar CSV somente da página carregada, mantendo decimais e a proteção existente contra fórmulas                      | 10 testes direcionados de produtos/exportador |

As quatro tarefas observaram testes inicialmente falhando antes da implementação. As traduções foram integradas centralmente em PT-BR/EN/ES para evitar conflitos. A revisão independente do conjunto não encontrou P1/P2. Tipos e formatação passaram. A suíte web integrada passou com **699 testes em 88 arquivos**. A CI completa deve ser conferida no candidato final do PR.

Também foi incluída uma estabilização do teste já existente `email-provider-preference-panel.test.tsx`: a expectativa agora aguarda a consulta de status OAuth disparada pelo efeito do componente filho, em vez de assumir que ela já terminou quando a mensagem de preferência salva aparece. O problema havia sido observado na CI do PR #325; não há alteração no comportamento de e-mail.

## Limites

As novas consultas usam a API autenticada e as permissões existentes. Filtros locais e exportações continuam limitados aos registros carregados. A paginação por offset não fornece snapshot estável sob alterações concorrentes; a mesclagem por ID evita cartões duplicados, mas não garante ausência de lacunas se registros mudarem de posição no servidor. Nenhum contrato de API, schema, migração, guard ou configuração de produção foi alterado.

Não foram usados dados de clientes, a API implantada ou o banco local implantado para testar. CI, integração em main, deploy e homologação externa são etapas distintas; o desenvolvimento não aprova produção nem resolve as pendências de domínio/OAuth real.
