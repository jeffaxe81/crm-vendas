# CRM — Backup, restauração e gestão de dados

Status: desenho técnico para revisão; implementação ainda não iniciada.

## Objetivo e base existente

Implementar Administração → Backup e Gestão de Dados conforme escopo aprovado por Jefferson Machado. A stack principal é NestJS/Prisma/PostgreSQL em apps/api e Next.js em apps/web. A autorização atual distingue ADMIN, MANAGER, SELLER e VIEWER; não existe Superusuário separado. A API usa isolamento por organização e auditoria.

## Autorização

Adicionar atributo protegido de Superusuário à associação usuário/organização, separado de perfis e permissões delegáveis. Sua concessão inicial será feita por comando administrativo de implantação, nunca por cadastro público, edição de perfil ou API comum. Administradores existentes não serão promovidos automaticamente. O atributo será consultado no servidor em cada operação e devolvido à sessão apenas para controlar a interface. Todas as rotas do módulo exigirão sessão humana ativa e Superusuário da organização corrente; chaves de integração não terão acesso. O atributo não concede acesso a outras organizações.

## Conteúdo e armazenamento

Backup manual e programado de todos os dados persistentes da organização, configurações e referências necessárias à recuperação, com manifesto de versão, contagem por categoria, data, organização, tamanho e checksum. Segredos serão criptografados no armazenamento, sem exposição em prévias ou logs. Sessões e tokens ativos não serão recuperados. O adaptador de anexos incluirá os arquivos quando houver armazenamento de anexos implantado; ausência ou indisponibilidade de arquivos referenciados fará o backup falhar explicitamente.

Manter catálogo persistente de backups e operações, separado do conjunto restaurável. Arquivos ficarão em armazenamento privado durável, fora do diretório público da aplicação. Download passa pela API autorizada. Estados: aguardando, executando, concluído e falhou; nenhuma falha parcial será apresentada como sucesso. Exportação usa snapshot consistente e escopo explícito da organização, sem conexão da aplicação com BYPASSRLS.

## Backup automático e histórico

Tela oferece execução manual, frequência diária/semanal ou intervalo personalizado, horário em America/Sao_Paulo e retenção dos últimos 7, 15, 30 ou 90 backups concluídos. Histórico apresenta data, tipo, responsável ou agendamento, tamanho e estado. Worker persistente coordena execuções com trava por organização, inclusive entre réplicas. Retenção só remove cópias após confirmação de novo backup válido; a cópia de segurança de uma operação em andamento permanece protegida. Exclusão manual de backup exige confirmação e registro de auditoria.

## Restauração

Restaurar pelo identificador de uma cópia catalogada. Prévia mostra data, tamanho, versão, categorias e contagens. Rejeitar organização diferente, arquivo corrompido, versão incompatível, referências inválidas ou falta de capacidade antes de modificar dados. Exigir senha atual e confirmação explícita RESTAURAR DADOS, vinculadas ao backup e a uma prévia com validade curta.

Bloquear escritas da organização em todos os caminhos de mutação durante a operação. Criar e verificar backup do estado atual antes de substituir dados. Carregar dados em área de preparação, validar relações e aplicar a substituição de forma transacional; em falha, preservar o estado anterior. Incluir identidade e configurações da organização na recuperação, mas preservar a associação e a credencial atual do Superusuário executor para evitar perda de acesso. Invalidar sessões da organização após restauração. Catálogo de backups, autorização de Superusuário e trilha de auditoria ficam fora da substituição.

## Exclusão de dados

Oferecer categorias existentes: empresas, contatos, oportunidades, atividades/tarefas, anotações/histórico de interações, solicitações de atendimento e arquivos/anexos quando disponíveis. Leads só aparecerão como categoria separada se houver modelo próprio. A prévia lista registros e dependências afetados: nunca apagar uma dependência não confirmada silenciosamente. Permitir apagar todos os dados operacionais, preservando usuários, associações, perfis, permissões, configurações e auditoria de segurança.

Exigir dupla confirmação, senha atual e expressão APAGAR DADOS. A autorização se vincula à organização, categorias e contagens da prévia; alterações relevantes exigem nova prévia. Gerar e verificar backup completo antes de qualquer exclusão em massa. Se backup ou auditoria obrigatória falharem, abortar. Executar exclusão transacional na ordem das dependências, sob bloqueio de escritas. Arquivos são marcados para remoção após commit, com tarefas idempotentes e recuperação de falhas. Logs operacionais serão separados dos registros de auditoria de segurança; somente logs operacionais poderão ser expurgados.

## Auditoria e interface

Registrar solicitação, início, sucesso/falha, download, exclusão de backup, alteração de agenda e acessos negados. Incluir executor, organização, data/hora, IP tratado conforme proxy confiável, identificador da operação, categorias e contagens. Não registrar senha, token, chave ou conteúdo pessoal do backup. Auditoria de sucesso deve fazer parte do commit da operação.

Integrar ao agrupamento Administração do workspace existente e manter o desenho visual do CRM. Exibir andamento real por etapas; apresentar porcentagem somente quando houver total mensurável. Falhas mostram causa tratável e identificador de operação, sem expor detalhes sensíveis.

## Critérios de validação

- Administrador comum, perfis personalizados, chave de API e usuário sem sessão recebem negativa em todas as rotas; concessão indevida de Superusuário é impossível pela API comum.
- Backup e restauração de uma organização não leem nem alteram dados de outra, inclusive por identificadores manipulados.
- Round-trip em PostgreSQL real com empresas, contatos, oportunidades, atividades, solicitações, configurações e relações; anexos incluídos quando implantados.
- Arquivo corrompido, versão incompatível, senha errada, confirmação expirada, disco cheio, falha de backup e falha de commit não deixam estado parcial.
- Bloqueio de escritas abrange API humana, integrações e tarefas; duas réplicas não executam operações concorrentes da mesma organização.
- Exclusão preserva usuários, configurações, Superusuário, catálogo e auditoria; dependências e contagens correspondem à confirmação.
- Agendamento, retenção e retomada após reinício funcionam sem duplicar operações.
- Testes de interface cobrem visibilidade, confirmações, estado de progresso e erro; verificações de tipos, build e testes pertinentes passam antes da release de teste.

## Entrega

Implementar em branch isolada, com migrações, configuração do armazenamento/worker, procedimento para provisionar Superusuário e recuperação documentada. Disponibilizar primeiro como release de teste. Nenhum dado real será apagado ou restaurado durante desenvolvimento e validação.
