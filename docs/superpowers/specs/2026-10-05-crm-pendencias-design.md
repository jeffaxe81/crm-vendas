# CRM — conclusão das pendências do manual

Status: escopo solicitado pelo usuário; desenho para revisão. Não representa funcionalidades entregues.

## Objetivo

Concluir todas as funcionalidades ausentes apontadas no Manual de Configuração CRM Axesistemas, edição 1.0, e integrá-las à main com verificação. A autorização inclui implementação e merge. A referência inicial é main após PR #84. O documento divide o trabalho em módulos para que cada entrega possa ser validada independentemente.

## Base e ordem de execução

Stack principal: apps/api (NestJS/Prisma/PostgreSQL/RLS), apps/web (Next.js), packages/contracts. Não portar funcionalidades de interfaces legadas sem avaliação. Preservar navegação agrupada, preferências por usuário/organização e identidade visual Axesistemas. A CI do GitHub fornece PostgreSQL e Docker; testes locais unitários complementam, mas não substituem, os testes de banco da CI.

| Ordem | Módulo                     | Resultado esperado                                                                                                                                                     |
| ----- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Verificação da base        | Corrigir formatação que interrompe a CI, recuperar execução dos testes e não declarar entrega com testes não executados.                                               |
| 1     | Backup e gestão de dados   | Concluir o desenho e plano já aprovados: backup manual/programado, armazenamento privado, retenção, histórico/download, restauração transacional e exclusão protegida. |
| 2     | Perfis e carteira          | Perfis configuráveis com permissões efetivas; acesso do vendedor à própria carteira imposto no servidor.                                                               |
| 3     | Cadastros configuráveis    | Telas de definições de campos de Empresa/Contato e catálogo de tags, incluindo cor.                                                                                    |
| 4     | Funil e política comercial | Criar/editar funis, etapas e ordem; moeda e limites de desconto configuráveis.                                                                                         |
| 5     | Atendimento                | Participantes por fila, habilidades e roteamento; expediente, feriados e cálculo de SLA por calendário.                                                                |
| 6     | Integrações                | Tela de credenciais, cadastro e entrega auditada de webhooks e configuração do endereço NEO.                                                                           |
| 7     | Relatórios e início        | Construtor de relatórios, widgets adicionais com métricas definidas e agendamento de exportações.                                                                      |
| 8     | Integração NEO ampliada    | Sincronização de contatos/histórico e autenticação única condicionadas a APIs e protocolo suportados pelo ambiente externo.                                            |

## 1. Backup

Manter como autoridade a especificação 2026-10-05-crm-backup-design.md e o plano 2026-10-05-crm-backup.md, aprovados. Operações restritas ao Superusuário por associação; administrador comum e chaves de API não recebem esse poder. Testes incluem confirmação expirada, corrupção, operação concorrente, rollback e isolamento de organizações. A base atual de Superusuário não equivale a módulo de backup concluído.

## 2. Perfis e carteira

Utilizar Role/RolePermission existentes; carregar permissões efetivas no servidor em vez de depender somente do enum estático. Papéis de sistema permanecem como padrões; perfis personalizados podem conceder apenas permissões delegáveis que o administrador possui. Superusuário continua fora dessa delegação.

Escopos de registro: OWN e ORGANIZATION. SELLER inicia com OWN para oportunidades e entidades da carteira. Associação de empresa/contato à carteira precisa ser explícita e auditada, com migração dos registros existentes para preservar integridade; não inferir propriedade só pelo criador do cadastro. Aplicar escopo também em detalhes por ID, importações, exportações, relatórios e integrações. MANAGER/ADMIN usam ORGANIZATION conforme permissões. Contatos compartilhados exigem associações explícitas de carteira para cada usuário autorizado; a associação à empresa não concede acesso implicitamente. Registros antigos sem associação ficam disponíveis a ADMIN/MANAGER para atribuição, sem exclusão de dados ou concessão automática a vendedores.

## 3. Campos e tags

Adicionar administração visual do catálogo de tags e das definições existentes de campos: escopo, chave, rótulo, tipo, obrigatório, ativo e opções de lista. Cor opcional de tag com valores validados. Valores existentes não podem ser silenciosamente apagados ao alterar uma definição. Remover de SELLER o poder de alterar definições por padrão; preenchimento de valores e associação de tags continuam separados da administração do catálogo.

## 4. Funil e políticas comerciais

Editor visual de funis, etapas OPEN/WON/LOST e ordenação; movimentação transacional de etapas com oportunidades existentes. Desativar etapas referenciadas exige destino explícito ou preservação para leitura histórica. Não renomear os estados de negócio existentes silenciosamente.

Moeda padrão por organização e moeda explícita da oportunidade; relatórios não somam moedas diferentes sem regra de conversão fornecida. Na primeira entrega, agrupar resultados por moeda, sem inventar câmbio. Desconto máximo por perfil aplicado a alterações de itens no servidor, importação e API. Registrar exceção somente se houver permissão administrativa específica e auditoria.

## 5. Atendimento

Cadastro de participantes ativos por fila e habilidades; distribuição seleciona apenas participantes elegíveis, respeitando situação, habilidades requeridas e menor carga. Definir fallback quando nenhum participante atende aos critérios: manter sem responsável e sinalizar à operação, nunca escolher alguém fora da fila silenciosamente.

Calendários por organização/fila com timezone, dias da semana, intervalos e feriados; política de SLA pode usar minutos corridos (compatibilidade atual) ou úteis. Persistir regra aplicada ao abrir solicitação; alteração de calendário não reescreve automaticamente a história. Testar virada de dia, feriados, diferentes zonas e mudança de prioridade.

## 6. Integrações

Tela para criar/listar/revogar chaves existentes, revelação única do segredo e escopos limitados às permissões atuais. Tela para endereço NEO com validação equivalente à atual e permissão específica; não expor segredos de infraestrutura em configuração comum.

Webhooks: destinos HTTPS privados da organização, seleção explícita de eventos, assinatura, fila persistente, repetição limitada, histórico redigido e prevenção de acesso a rede interna/metadados. Sem enviar dados a destinos de terceiros antes de sua configuração explícita pelo administrador. Usar contratos mínimos de eventos; não publicar campos pessoais desnecessários.

## 7. Relatórios e widgets

Construtor guiado por fontes autorizadas, seleção de campos, filtros, agrupamentos e agregações permitidas. Não aceitar SQL ou JavaScript livres. Compartilhamento por organização/perfil sem ampliar o escopo de dados do leitor. Widgets consomem relatórios validados, com limites e tratamento de falhas; fórmulas usam conjunto restrito de operadores e campos autorizados.

Agendamento inicialmente gera exportação para consulta/download no CRM, sem envio automático a pessoas ou serviços não configurados. Caso sejam necessários e-mails, especificar destinatários, integração de envio e autorização em uma etapa própria. Retenção e custo das exportações devem ser limitados.

## 8. Integração externa ampliada

O iframe existente não demonstra suporte a SSO ou APIs de contatos/histórico. Preparar adaptador e tela de diagnóstico; antes de conectar, obter documentação, sandbox, credenciais por mecanismo seguro e mapeamento de identidade do ambiente NEO. Sem esses insumos, registrar dependência como bloqueada, sem simular sincronização concluída. O CRM não deve capturar senha externa para substituir SSO.

## Entrega e verificação

Cada módulo terá especificação e plano próprios, testes RED→GREEN, validação de isolamento em PostgreSQL e revisão de segurança das rotas sensíveis. Publicar em branch, abrir PR e integrar à main após verificações pertinentes aprovadas. Atualizar manual e projeção conforme comportamento entregue. Não marcar item entregue por existir tabela, atributo ou mockup.

O usuário solicitou todos os itens e merge. A divisão acima conserva esse objetivo; a execução deve continuar módulo por módulo. O primeiro plano de implementação permanece o de backup, já aprovado. Os módulos posteriores precisam detalhar seus contratos antes de implementação, para evitar alterações incompatíveis ou permissões excessivas.
