# Requisitos Funcionais e Não Funcionais

## Requisitos funcionais

| ID    | Requisito                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| RF-01 | O sistema deve exigir autenticação local por login e senha para acessar dados comerciais, sem dependência de autenticação da Manus. |
| RF-02 | O sistema deve diferenciar, no mínimo, usuários administradores e usuários padrão.                                                  |
| RF-03 | O sistema deve cadastrar, consultar, editar e inativar pessoas e empresas.                                                          |
| RF-04 | O sistema deve permitir vincular contatos a empresas.                                                                               |
| RF-05 | O sistema deve pesquisar e filtrar clientes por nome, documento, telefone ou e-mail.                                                |
| RF-06 | O sistema deve registrar interações em linha do tempo com responsável e data.                                                       |
| RF-07 | O sistema deve criar tarefas e compromissos vinculados a clientes e oportunidades.                                                  |
| RF-08 | O sistema deve cadastrar oportunidades com cliente, valor estimado, previsão e etapa.                                               |
| RF-09 | O sistema deve movimentar oportunidades entre etapas do funil.                                                                      |
| RF-10 | O sistema deve mostrar indicadores comerciais básicos e pendências no painel inicial.                                               |
| RF-11 | O sistema deve registrar auditoria para as principais ações de criação, alteração, inativação e movimentação.                       |

## Requisitos não funcionais

| ID     | Requisito                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| RNF-01 | A interface deve ser responsiva e acessível por teclado.                                                    |
| RNF-02 | Dados de domínio devem ser validados no cliente e no servidor.                                              |
| RNF-03 | Registros inativados devem permanecer preservados para consulta histórica.                                  |
| RNF-04 | Consultas de lista devem suportar paginação, filtros e ordenação.                                           |
| RNF-05 | A aplicação deve manter interface, regras de negócio, dados e integrações em módulos separados.             |
| RNF-06 | Dados sensíveis não devem ser inseridos em logs da aplicação.                                               |
| RNF-07 | O design deve manter aparência elegante, espaçamento generoso, hierarquia visual clara e contraste legível. |
