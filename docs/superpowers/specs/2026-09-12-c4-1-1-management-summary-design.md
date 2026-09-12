# C4.1.1 — Resumo Gerencial — Design

## Aprovação e estado

O responsável aprovou nesta conversa o escopo C4.1.1 com a resposta
“aprova a C4.1.1 nesses termos? sim”. Esta especificação formaliza o escopo;
sua revisão precede o plano de implementação. Não há código funcional entregue
nesta etapa, nem autorização de merge em main.

Repositório: jeffaxe81/crm-vendas.
Base inspecionada: main em 6cfaa8184e94c015cfc60bbac1c1a5f237a6aadf.
Marco anterior: Fase 1 fechada pelo PR #34.

## Objetivo e decisão arquitetural

Oferecer visibilidade gerencial sobre a situação atual das oportunidades e
atividades da organização autenticada. Usar agregação na API NestJS com
Prisma/PostgreSQL e uma tela simples em apps/web, mantendo o shell existente.
Não somar listas paginadas no navegador e não criar infraestrutura analítica.

Alternativas avaliadas: agregação no navegador pode omitir registros de outras
páginas; armazenamento analítico separado amplia operação e escopo. A agregação
na API reutiliza o isolamento existente e fornece totais completos.

O backlog marca MVP-08 como concluído, mas a navegação canônica inspecionada
contém Empresas, Contatos, Atividades e Oportunidades, sem painel. Existe um
Dashboard no legado client. Não considerar esse legado como entrega canônica
nem alterar retroativamente o fechamento da Fase 1. Registrar a divergência no
checkpoint da C4.1.1.

## Regras dos indicadores

Todos os cálculos usam exclusivamente a organização da sessão e registros com
deletedAt nulo. São um retrato atual, sem filtro por período ou reconstrução
histórica. A API captura um único instante de referência por consulta.

| Indicador               | Regra                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Oportunidades por etapa | Contagem por pipelineId e stageId, com nomes do funil e da etapa; nomes iguais não fundem grupos.                    |
| Valor em aberto         | Soma decimal de estimatedValue apenas quando a etapa tem kind OPEN. Não representa receita realizada ou faturamento. |
| Atividades pendentes    | Contagem de atividades PENDING.                                                                                      |
| Atividades vencidas     | Subconjunto PENDING com dueAt estritamente anterior ao instante de referência.                                       |
| Atividades sem prazo    | Subconjunto PENDING com dueAt nulo. Não são vencidas.                                                                |

Atividades COMPLETED e CANCELLED não entram nos três indicadores de pendência.
dueAt igual ao instante de referência não está vencido. Excluir logicamente uma
atividade não altera contagens de oportunidades e vice-versa; consultas separadas
evitam multiplicação de valores por joins. Etapas sem oportunidades não precisam
aparecer; oportunidades em etapas inativas continuam contadas se não excluídas.

A soma deve preservar Decimal no banco e ser serializada como texto decimal
com duas casas, sem conversão intermediária para ponto flutuante. O modelo atual
não possui moeda por oportunidade; não inferir conversões nem introduzir suporte
multimoeda. A interface identifica o número como valor estimado em aberto.

## Contrato e fluxo

Proposta de rota: GET /api/v1/reports/management-summary, somente leitura.
Não aceitar organizationId, tenant ou responsável como seletor de escopo.

Resposta contratada em packages/contracts:

- asOf: timestamp ISO UTC usado na classificação de vencimento;
- opportunitiesByStage: lista de pipelineId, pipelineName, stageId, stageName e count;
- openEstimatedValue: texto decimal com duas casas;
- pendingActivities: inteiro não negativo;
- overdueActivities: inteiro não negativo;
- undatedActivities: inteiro não negativo.

Ordenar grupos de modo determinístico por funil e ordem de etapa, usando IDs
como desempate. Uma organização sem registros retorna lista vazia e totais zero.
Erro de consulta retorna erro no padrão da API, nunca totais zero fabricados.

As agregações são executadas em transação tenant-aware, sob a role de aplicação
sem BYPASSRLS, com snapshot consistente entre os indicadores. O plano deve
verificar como configurar esse isolamento com o helper Prisma existente,
preservando o contrato dos demais consumidores.

## Autorização e isolamento

Adicionar uma permissão explícita reports.read ao catálogo existente, concedida
somente a ADMIN e MANAGER. SELLER e VIEWER não recebem essa permissão.
Preservar todas as permissões atuais de leitura e escrita dos demais módulos.

A API aplica autenticação e autorização antes da consulta. Usuário não
autenticado recebe 401; usuário autenticado sem permissão recebe 403. Ocultar a
navegação não substitui a autorização no servidor. A organização vem da sessão;
RLS fail-closed permanece obrigatório, inclusive nas agregações e relações.
O endpoint não altera dados de negócio nem cria um novo sistema de auditoria.

## Interface

Adicionar Resumo gerencial à navegação somente para reports.read, preservando
a tela inicial e o desenho atual. Exibir tabela de oportunidades por funil/etapa,
total estimado em aberto e contagens de atividades. Mostrar horário da consulta
formatado para o usuário, mantendo a comparação temporal na API.

Estados explícitos: carregando, sucesso sem dados, sucesso com dados e erro com
ação de tentar novamente. Em erro, não exibir zeros como se fossem dados reais.
Sem polling automático, exportações, filtros ou gráficos adicionais nesta fatia.

## Componentes e limites

- apps/api/src/reports: controller, service e module próprios;
- apps/api/src/authorization: permissão e testes de perfis;
- packages/contracts: schema da resposta e testes;
- apps/web: tela, integração com shell e testes comportamentais;
- tests/e2e: jornada gerencial com dados controlados;
- docs: checkpoint, changelog e manual operacional.

Não requer novo model, migration ou política RLS. Não promover endpoints ou
dependências do legado tRPC/Manus. Não implementar outras frentes da Fase 2.

## Microentregas e critérios de aceite

1. API e contratos: testes RED observados antes do código; GREEN para cálculos,
   precisão decimal, dados vazios, soft delete, limites de prazo, permissões e
   isolamento entre organizações. Testar volume superior a uma página de listas.
2. Web: navegação autorizada, indicadores reais, tabela, horário e estados
   loading/empty/error; testes devem exercitar comportamento, não só marcação.
3. Gate integral e manual: E2E confronta valores esperados com a tela; executar
   formatação, lint, typecheck, testes, migrations, Compose e builds Docker no
   mesmo SHA candidato. Registrar comandos e resultados sem reutilizar o GREEN
   da Fase 1 como evidência desta entrega.

O manual descreve acesso, interpretação de cada indicador, vencimento e ausência
de prazo, diferença entre valor estimado e faturamento, atualização e erros.
Branch própria, checkpoint recuperável e aprovação humana antes do merge.

## Fora do escopo

Exportações CSV/PDF, tendências históricas, conversão de vendas, metas,
ranking de vendedores, previsões, IA, agenda visual, integrações externas,
notificações e alterações no ciclo de vida de oportunidades ou atividades.
