# Seis gaps adicionais e duas integrações

## Entregas

| Frente | Resultado                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| 1      | CSV de solicitações: seis colunas já exibidas, somente a página atual, sem descrição ou IDs internos               |
| 2      | CSV de territórios: nome, região e vendedor da página atual                                                        |
| 3      | Gestão de usuários: busca local por nome/e-mail, filtros de perfil/vínculo, limpeza, contagem e vazio              |
| 4      | CSV da agenda: título, tipo, status, prioridade e prazo ISO da página atual; ICS preservado                        |
| 5      | Lista de backups: filtro pelos estados reais do contrato, limpeza e contagem; ações e polling preservados          |
| 6      | Dashboards: testes determinísticos dos limites 1/2/3/7/20 e rejeição de onze configurações inválidas antes da rede |
| 7      | PR #325: integração da paginação incremental de empresas confirmada na main                                        |
| 8      | PR #326: integração das quatro melhorias anteriores confirmada na main                                             |

A branch parte da main e foi atualizada até `d5007961`. As duas integrações são etapas anteriores confirmadas; as seis mudanças novas deste checkpoint não equivalem a deploy ou aprovação de produção.

## Execução e validação

Seis tarefas foram distribuídas ao grupo em worktrees independentes. O limite de uso interrompeu os auxiliares, deixando alterações parciais de solicitações, territórios e usuários. O coordenador preservou esses arquivos, concluiu as três demais tarefas e fez a revisão final do conjunto. A revisão independente final foi retomada posteriormente. Ela identificou uma falha de elegibilidade do CSV de territórios: após falha de busca, abrir um formulário limpava o erro e reabilitava resultados antigos. Um teste reproduziu a falha antes da correção; a exportação agora exige o escopo da última consulta concluída (token, página, busca e refresh). Não houve outros P1/P2 na revisão inicial.

- Quatro cenários de agenda/backups foram observados falhando por ausência dos novos controles antes da implementação.
- Contraprova dos arquivos originais de solicitações/territórios/usuários: nove verificações novas falharam, oito existentes passaram; os três componentes foram restaurados após a execução.
- Os 31 testes direcionados das cinco telas passaram.
- Os 18 testes direcionados de dashboards passaram.
- Duas mutações temporárias foram detectadas: iniciar requisições além do lote limitado e aceitar concorrência 21. O script original foi restaurado e permaneceu sem diff.
- Tipos e formatação passaram. A suíte web do candidato inicial passou com **716 testes em 89 arquivos**; a suíte de repositório passou com **134 testes**. Após a correção indicada pela revisão, os nove testes de territórios passaram; a suíte web completa deve ser repetida no novo candidato. A CI completa deve ser conferida no candidato final do PR.

Os testes existentes de backups passaram a localizar os status nos itens das listas, pois os mesmos rótulos agora também aparecem no seletor de filtro. Uma asserção incompleta de opções de perfil foi substituída pela verificação dos valores efetivos do select. A ação de salvar perfil continua sendo verificada por sua chamada PATCH, sem exigir uma mensagem transitória que é desmontada pelo refresh já existente.

## Limites

Os CSVs reutilizam o exportador local com escape de fórmulas e aspas. Nenhuma exportação solicita registros extras ou inclui tokens. Datas ISO da agenda representam prazos, sem duração inventada. Busca de usuários e filtro de backups operam somente sobre registros carregados. As permissões, confirmações, endpoints, quotas, restauração, exclusão e polling permanecem sob seus controles existentes.

Não foram usados API ou banco implantados, dados de clientes, envio de e-mail ou homologação de domínio. O limite de uso reduz a paralelização possível, mas não substitui os gates técnicos antes de integração.
