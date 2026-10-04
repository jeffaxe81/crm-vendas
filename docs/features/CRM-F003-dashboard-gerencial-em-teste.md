# CRM-F003 — Dashboard gerencial personalizável

**Status: EM TESTE.** Branch `feat/crm-dashboard-testing`. Não integrada ao `main`. Inclui as entregas anteriores de design, comunicação e agenda.

## Intenção e referência

O usuário aprovou um dashboard inspirado na utilização do Salesforce, adaptado ao Axesistemas: indicadores, gráficos, personalização e abertura de relatórios relacionados. A entrega é delimitada ao resumo gerencial existente; não cria um construtor genérico de relatórios.

Referência oficial: [Salesforce — dashboards Lightning e componentes](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_visualizing_data). Foram aproveitados os conceitos de componentes e relatórios relacionados, sem afirmar equivalência com todas as capacidades do Salesforce.

## Entrega e significado dos dados

O menu **Resumo gerencial** passa a exibir seis componentes configuráveis:

| Componente              | Dados                                                                                                               | Relatório relacionado      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Valor em aberto         | Soma do valor estimado de oportunidades abertas                                                                     | Funil                      |
| Atividades pendentes    | Total consolidado da organização                                                                                    | Atividades por responsável |
| Atividades atrasadas    | Métrica existente do resumo gerencial                                                                               | Atividades por responsável |
| Atividades sem data     | Métrica existente do resumo gerencial                                                                               | Atividades por responsável |
| Oportunidades por etapa | Contagem atual por funil e etapa                                                                                    | Funil                      |
| Vendas ganhas por mês   | Valor estimado das oportunidades em etapa ganha, agrupado pelo mês da previsão de fechamento no relatório existente | Vendas por período         |

O gráfico de etapas mostra distribuição atual, não taxa de conversão. O gráfico de vendas não representa faturamento ou recebimento. O ano selecionado é um filtro exclusivo desse gráfico. Os demais indicadores continuam consolidados, sem filtro global de período. O resumo e o gráfico mensal mostram suas próprias datas de atualização.

**Ver relatório** abre o relatório existente, onde seus filtros podem ser aplicados. Não transfere automaticamente filtros de atraso/status/ano; o relatório tem escopo próprio.

## Personalização e atualização

- **Personalizar painel:** mostrar/ocultar componentes e reordenar usando botões com nomes acessíveis; não depende de arrastar com mouse.
- **Restaurar padrão:** recuperar os seis componentes na ordem original, inclusive quando todos estiverem ocultos.
- Ordem e visibilidade são salvas por organização/usuário neste navegador. Não há sincronização entre dispositivos.
- Apenas preferências são armazenadas; valores, dados comerciais e token não são salvos no localStorage da feature. A identidade da preferência vem da sessão autenticada.
- Preferências inválidas usam o padrão. Bloqueio de armazenamento mantém a edição na sessão e mostra um aviso ao tentar salvar.
- **Atualizar painel:** recarrega resumo e gráfico visível, preservando o ano escolhido. Falha no resumo conserva o último resumo com aviso explícito; falha no gráfico mensal aparece no próprio componente.
- A feature usa o acesso existente `reports.read` e os endpoints atuais. Não altera backend ou banco.

## Verificação

| Verificação               | Resultado                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Frontend completo         | 197 testes aprovados em 41 arquivos                                                                |
| Novos testes do dashboard | 13 aprovados, incluindo falha e nova tentativa                                                     |
| TypeScript                | Aprovado                                                                                           |
| Build de produção         | Aprovado                                                                                           |
| Formatação e diff         | Aprovados nos arquivos da entrega                                                                  |
| Revisão independente      | Sem pendências relevantes após o ajuste de atualização                                             |
| `pnpm test`               | Interrompido no teste `compose defines the Cycle 0 service topology` por Docker ausente (`ENOENT`) |

Não foram executados testes visuais em navegador real, E2E, integração com banco ou build de imagens Docker nesta entrega. Node disponível: 24.19.0; versão declarada pelo projeto: 24.20.x.
Testes incluem personalização, restauração, ordem, preferências isoladas, armazenamento inválido/indisponível, abertura de relatório, gráficos, atualização e falha seguida de nova tentativa.

## Roteiro de homologação

1. Entrar com `reports.read` e abrir Resumo gerencial; comparar valores com os relatórios existentes.
2. Ocultar componentes, mudar a ordem e recarregar a página; validar restauração para o mesmo usuário/organização.
3. Entrar com outro usuário/organização e conferir que sua configuração é independente.
4. Mudar o ano do gráfico e clicar Atualizar painel; o ano deve permanecer.
5. Abrir relatórios relacionados e aplicar seus filtros.
6. Testar falhas de rede e recuperação; conferir avisos e datas do último carregamento.
7. Validar desktop/celular e teclado, especialmente os controles de personalização e gráficos.

## Próximos incrementos

Filtros globais de período/responsável, múltiplos dashboards e preferências persistidas no servidor exigem desenhos próprios e não estão incluídos nesta versão em teste.
