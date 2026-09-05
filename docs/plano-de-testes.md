# Plano e Evidências de Testes

## Estratégia

O incremento será verificado por testes automatizados das regras críticas de domínio, validação estática de tipos e revisão funcional e visual do fluxo no navegador. As evidências técnicas serão atualizadas ao final da implementação.

| ID     | Cenário                                                       | Tipo de teste            | Evidência esperada                           |
| ------ | ------------------------------------------------------------- | ------------------------ | -------------------------------------------- |
| TST-01 | Criar cliente e impedir campos inválidos                      | Automatizado             | Teste unitário do procedimento/validação     |
| TST-02 | Inativar cliente preservando seu registro                     | Automatizado             | Teste de regra de negócio                    |
| TST-03 | Criar oportunidade com valor não negativo e cliente associado | Automatizado             | Teste de regra de negócio                    |
| TST-04 | Mover oportunidade entre estágios e gravar auditoria          | Automatizado             | Teste do fluxo de domínio                    |
| TST-05 | Criar e concluir tarefa                                       | Automatizado e funcional | Teste e verificação na interface             |
| TST-06 | Navegação e telas em desktop e mobile                         | Visual                   | Capturas de tela de validação                |
| TST-07 | Compilação e tipagem                                          | Técnico                  | Execução bem-sucedida de testes e TypeScript |

## Evidências

| Evidência              | Resultado                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipagem estática       | `pnpm check` executado com sucesso.                                                                                                                                                                                    |
| Testes automatizados   | `pnpm test` executado com sucesso: 3 arquivos e 13 testes aprovados.                                                                                                                                                   |
| Regras verificadas     | Validação de cliente, vínculo do usuário autenticado, edição, movimentação e inativação de oportunidade, conclusão e inativação de atividade, inativação de interação, logout e restrição administrativa da auditoria. |
| Revisão visual desktop | Painel e funil revisados em 1280 × 720.                                                                                                                                                                                |
| Revisão visual mobile  | Painel e funil revisados em 375 × 812.                                                                                                                                                                                 |
| Registros recentes     | Registros do servidor e do navegador verificados sem erros ou exceções recentes.                                                                                                                                       |
| Revisão final          | Telas de clientes e oportunidades revisadas após os ajustes de paginação, edição e tratamento de falhas.                                                                                                               |
| Delimitação de escopo  | Revisado que apenas a Fase 1 possui código implementado; fases futuras mantidas apenas na documentação.                                                                                                                |
| Autenticação local     | Bootstrap do administrador, login com senha protegida, emissão de sessão local e rejeição de cookie inválido verificados por testes automatizados.                                                                     |
| Revisão de acesso      | Tela de login e configuração inicial revisadas em desktop e mobile; não há redirecionamento ou referência ativa ao fluxo OAuth.                                                                                        |
