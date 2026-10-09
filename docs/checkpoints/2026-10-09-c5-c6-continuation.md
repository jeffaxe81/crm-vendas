# Continuidade C5/C6 — 09/10/2026

## C5 — Atendimento

PR #103 integrado na `main` pelo commit
`6a2af0a84be6ec29fb08d00d0b2397a5be41906a`. Permite editar assunto,
descrição, prioridade, canal e fila de um chamado aberto. Reutiliza
`PATCH /tickets/:id`, com `ticket.write` e versão para concorrência otimista.
O serviço existente mantém as regras de tenant, estado final e SLA.

Gate integral #966, run `37832371629`, confirmado GREEN no SHA
`b716cdabfae7f5523ea2d6b20dba222a91a264ce`. Revisão independente sem
problemas Critical/Important. #99, #100 e #101 já estavam integrados.

## C6 — Fundação de integrações e comunicação

Incremento na branch `feat/c6-integration-admin-neo-mode`, baseada na `main`
atual com #103. Não equivale à conclusão de todas as integrações.

- Administração de chaves através dos endpoints existentes de F4.1: lista,
  criação, escopos permitidos, expiração opcional e revogação confirmada.
- `integration.read` filtra menu, preferências e leitura;
  `integration.manage` permite as operações de escrita.
- Segredo exibido uma única vez, apenas em memória. Fechar a exibição,
  navegar para outra seção ou sair remove a chave. Nenhum armazenamento no
  navegador. Cópia somente por ação explícita.
- `NEO_INTERACT_MODE=tab` apresenta o link externo e não monta iframe.
  `iframe` continua como padrão. URL HTTPS, sem credenciais/tokens.
- Altura inicial e largura máxima do iframe configuráveis entre 320 e 1600
  pixels, com limite da largura disponível na tela. Valores inválidos
  deixam a configuração indisponível.
- Compose repassa a configuração em runtime; guias de operação atualizados.

## Evidências

| Verificação                              | Resultado                                                      |
| ---------------------------------------- | -------------------------------------------------------------- |
| Baseline Web da main anterior a #103     | 232/232, 51 arquivos                                           |
| RED NEO                                  | 17 falhas funcionais esperadas; 40 testes anteriores passaram  |
| RED credenciais                          | 8 falhas por ausência do menu/tela; regra sem permissão passou |
| GREEN NEO direcionado                    | 61/61, 3 arquivos                                              |
| Regressão Web após integração de #103    | 263/263, 53 arquivos                                           |
| Contratos                                | 95/95, 20 arquivos                                             |
| Fundação documental                      | Aprovada                                                       |
| Lint e typecheck de contratos, API e Web | Aprovados após Prisma generate                                 |
| Testes locais do repositório sem Docker  | 5/5                                                            |
| Playwright discovery                     | 7 testes reconhecidos, incluindo o novo fluxo real de chaves   |
| Revisão independente                     | Sem falhas Critical/Important de produto                       |

O teste E2E novo exercita cadastro de organização de teste, criação visual da
chave, acesso autorizado a Empresas, rejeição de Contatos sem escopo,
exibição única após recarga e revogação com rejeição posterior da chave.
Seu prefixo foi conferido com o gerador real (`axk_`).

PostgreSQL, execução E2E, contrato Compose e imagens Docker dependem do gate
integral do GitHub. Não foram simulados como testes locais aprovados. O runtime
local usa Node 24.19.0; a CI usa a versão declarada 24.20.0. Nenhuma migration,
alteração de permissões do servidor ou operação destrutiva de dados foi adicionada.
Saídas geradas por Prisma/Next não fazem parte do diff deste incremento.

## Decisões e observações menores

Decisão: C6 significa Integrações nesta continuidade, conforme a decisão mais
recente do usuário. O roadmap canônico chama esse escopo de Fase 4. O antigo
plano de analytics/ML não foi adotado; se a nomenclatura estiver incorreta,
deve ser corrigida antes de selecionar o próximo incremento.

Observações menores de revisão, mantidas para um incremento posterior:

- C5: o seletor de fila inclui filas inativas, cuja troca é rejeitada pela API.
- C5: um editor já aberto permanece visível após finalizar o chamado; a API
  rejeita a gravação nesse estado.
- C5: ampliar cobertura de edição com conflito, falha de gravação,
  cancelamento e isolamento do editor.
- C6: respostas de API malformadas apresentam mensagens técnicas do Zod.
- C6: mover o foco para o painel de exibição única da chave após criação.

## Autorização e gate de publicação

O push da branch `feat/c6-integration-admin-neo-mode` foi rejeitado pela revisão
automática: a autorização de continuidade foi considerada insuficiente para
publicar o novo código no repositório público. Após apresentação do incremento
e solicitação de aprovação, o responsável respondeu **“Autorizado”** em
09/10/2026. Essa aprovação autoriza publicar a branch, abrir o PR, executar o
gate CI integral e mesclar na `main` quando todos os testes passarem.

No momento deste checkpoint, o build Web local retornou código de saída 0 e
gerou o artefato de produção. O gate integral de C6 continua pendente; testes
PostgreSQL, E2E e Docker não foram declarados aprovados. O PR deverá registrar
o resultado integral e o SHA verificado antes da integração.

## Pendências de escopo

F4.2 — Webhooks é o próximo incremento do plano de integrações. E-mail,
WhatsApp, CTI, ERP e observabilidade continuam pendentes. SSO e sincronização
com o NEO exigem documentação/acesso ao ambiente externo. Calendários úteis
de SLA, participantes/habilidades de filas, white-label e reset protegido de
dados de teste permanecem em seus escopos posteriores.
