# C3.5.4 — Web de Atividades

## Objetivo

Adicionar ao frontend canônico `apps/web` uma área de Atividades integrada ao `CrmShell`, consumindo exclusivamente a API tenant-aware entregue na C3.5.2 e preservando as decisões arquiteturais da C3.5.3.

A microentrega deve permitir visualizar e operar tarefas e compromissos sem antecipar agenda/calendário, automação de follow-up, recorrência, integração Google/Outlook, delegação para outros responsáveis ou vínculo com `Opportunity`.

## Contexto atual

O `CrmShell` canônico possui hoje apenas as seções `companies` e `contacts`. A navegação é controlada no cliente pela seleção de uma seção ativa, e `page.tsx` renderiza `CompaniesView` ou `ContactsView` usando a sessão autenticada existente.

A C3.5.2 já disponibiliza a API REST de atividades com criação, listagem, consulta, atualização/transição de status, soft delete, filtros, RBAC e isolamento tenant-aware. `Activity` já possui vínculos opcionais com `Company` e `Contact`.

A C3.5.3 definiu que `Opportunity` não será representada por referência solta ou entidade mínima. Portanto, a Web de Atividades não deverá expor campo de oportunidade até que o domínio canônico `Opportunity` exista.

## Decisão de arquitetura

A C3.5.4 será implementada como uma nova seção `activities` dentro do `CrmShell` existente.

Não será criada rota Next independente nesta etapa. Isso preserva o padrão atual do CRM Core e evita uma refatoração de navegação que não agrega valor ao objetivo imediato.

A nova view deverá seguir os mesmos contratos de sessão, autenticação e `apiRequest` já usados por Empresas e Contatos.

## Componentes

### Navegação

`CrmSection` será ampliado para incluir `activities`. O menu lateral receberá a opção `Atividades`, com o mesmo comportamento de seleção e `aria-current` usado pelas seções existentes.

`page.tsx` passará a renderizar `ActivitiesView` quando a seção ativa for `activities`.

### ActivitiesView

A nova view será criada no diretório canônico `apps/web/src/app/activities`.

A tela deverá oferecer:

- visão por status: `PENDING`, `COMPLETED` e `CANCELLED`;
- busca textual por título;
- identificação do tipo `TASK` ou `APPOINTMENT`;
- prioridade `LOW`, `MEDIUM` ou `HIGH`;
- prazo e destaque visual para atividade pendente vencida;
- vínculos opcionais com Empresa e Contato;
- estado vazio, carregamento e mensagem de erro;
- criação de atividade;
- conclusão;
- cancelamento;
- reabertura para `PENDING`;
- inativação lógica via `DELETE` da API.

Status e busca textual serão enviados à API como parâmetros da listagem. A Web não manterá uma implementação paralela de filtragem como fonte de verdade.

A tela não deverá duplicar lógica tenant-aware ou regras de transição do backend. O frontend envia comandos e reflete o estado retornado pela API.

## Criação de atividade

O formulário de criação deverá usar os contratos compartilhados de Activity já existentes.

Campos da primeira entrega:

- Tipo;
- Título;
- Detalhes opcionais;
- Prioridade;
- Prazo opcional;
- Empresa opcional;
- Contato opcional.

`ownerUserId` será preenchido automaticamente com `session.user.id`.

A C3.5.4 não consultará `/admin/users` para seleção de responsável, porque esse endpoint pertence ao domínio administrativo e exige `user.manage`. Delegação de atividade para outro usuário fica fora desta microentrega.

## Permissões

A interface deverá respeitar `session.permissions`.

Usuários com `activity.read` podem visualizar a seção e seus registros.

Controles de criação, mudança de status e inativação somente serão renderizados quando a sessão possuir `activity.write`. A API permanece como autoridade final de autorização.

Quando a sessão não possuir `activity.read`, a opção `Atividades` não será renderizada no menu e `ActivitiesView` não será montada, evitando qualquer chamada de listagem de atividades pelo frontend.

## Dados auxiliares

Para preencher os vínculos comerciais, a Web poderá reutilizar os endpoints canônicos de Empresas e Contatos já existentes.

A primeira versão carregará opções em lotes compatíveis com o comportamento atual das telas existentes, sem introduzir autocomplete remoto ou paginação infinita nesta etapa.

## Experiência visual

A implementação deverá seguir a linguagem visual já estabelecida em `apps/web`, incluindo tipografia, espaçamento, cartões, campos, botões, estados de foco e responsividade.

A tela legada `client/src/pages/Activities.tsx` serve apenas como referência funcional. Ela não deverá ser portada literalmente porque depende da arquitetura antiga, tRPC, IDs numéricos, `clientId` e `opportunityId` não compatíveis com o modelo canônico.

## Fluxo principal

1. Usuário autenticado entra no CRM.
2. O menu mostra `Atividades` somente quando houver `activity.read`.
3. Ao selecionar a seção, `ActivitiesView` carrega atividades `PENDING` por padrão.
4. O usuário pode alternar entre `PENDING`, `COMPLETED` e `CANCELLED` e pesquisar pelo título; cada mudança atualiza a consulta à API.
5. Com `activity.write`, pode criar uma atividade atribuída a si mesmo, vinculando opcionalmente Empresa e Contato.
6. Com `activity.write`, pode concluir, cancelar, reabrir ou inativar uma atividade.
7. Após mutações bem-sucedidas, a view refaz a consulta da visão atual e reflete o estado persistido pela API, sem exigir recarregamento completo da sessão.

## Tratamento de erros

Falhas de API deverão aparecer na própria view em linguagem clara, preservando a possibilidade de nova tentativa quando aplicável.

Erros `403` e `404` retornados pelo backend não serão reinterpretados para revelar existência de recursos. O frontend exibirá a mensagem segura fornecida pelo contrato da API.

O formulário deverá impedir envio repetido enquanto a mutação estiver em andamento.

## TDD e validação

A implementação seguirá RED → GREEN → refatoração controlada.

O primeiro RED deverá provar que a navegação canônica ainda não suporta a seção `activities` e que a nova view não existe.

Os testes deverão cobrir, no mínimo:

- presença/ausência do item de navegação conforme `activity.read`;
- ausência de chamada de atividades quando `activity.read` não existir;
- renderização da lista e estados de carregamento/erro/vazio;
- filtro por status e busca textual enviados à API;
- criação atribuída ao usuário autenticado;
- ausência de controles de escrita para sessão sem `activity.write`;
- conclusão, cancelamento e reabertura;
- inativação;
- vínculo opcional com Empresa e Contato;
- ausência de campo `Opportunity`;
- destaque de atividade pendente vencida.

O gate final deve continuar cobrindo a suíte Web/API existente, E2E, validação de Compose e build das imagens.

## Arquivos previstos

A implementação deverá permanecer concentrada, preferencialmente, em:

- `apps/web/src/app/crm-shell.tsx`;
- `apps/web/src/app/page.tsx`;
- `apps/web/src/app/activities/activities-view.tsx`;
- testes associados em `apps/web/src/app/activities` e/ou navegação;
- `apps/web/src/app/globals.css` somente para estilos novos estritamente necessários;
- `CHANGELOG.md` e checkpoint da microentrega ao final.

Nenhuma alteração de schema Prisma, migration, API de backend ou RBAC é esperada para a C3.5.4.

## Fora de escopo

- calendário/agenda visual;
- visão semanal/mensal;
- recorrência;
- lembretes e notificações;
- automação de follow-up;
- Google Calendar ou Outlook;
- `Opportunity`;
- delegação para outro responsável;
- criação de novo endpoint administrativo ou de diretório de usuários;
- refatoração global da navegação para rotas Next independentes.

## Critérios de conclusão

A C3.5.4 estará tecnicamente concluída quando:

- a seção Atividades estiver integrada ao shell canônico;
- leitura e escrita respeitarem as permissões da sessão;
- lifecycle básico funcionar contra a API C3.5.2;
- vínculos com Empresa/Contato estiverem disponíveis;
- `Opportunity` continuar ausente;
- testes novos e regressões existentes estiverem GREEN;
- E2E, Compose e build das imagens estiverem GREEN;
- changelog e checkpoint estiverem atualizados;
- o PR estiver pronto para revisão, sem merge automático.
