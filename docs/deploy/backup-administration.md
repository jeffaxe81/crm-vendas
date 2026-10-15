# CRM-Vendas — painel de backup (entrega inicial controlada)

## Estado

A tela **Administração → Backup e recuperação** e os endpoints `/api/v1/admin/backups`
são exclusivamente para a sessão humana com atributo protegido `isSuperuser`
na empresa ativa. Administradores comuns e API keys não têm acesso.

Esta entrega disponibiliza catálogo, fila manual, agenda/retenção, download
autenticado, prévia verificada e exclusão confirmada de cópias antigas.
**Restauração efetiva e limpeza de dados NÃO estão habilitadas**.
Não interpretar prévia como restore.

## Exclusão de uma cópia

O Superusuário seleciona **Excluir backup**, confere a cópia e digita
`EXCLUIR BACKUP`. A API `DELETE /api/v1/admin/backups/:id` recebe somente
`confirmation` e o `checksum` da cópia selecionada. Administradores comuns,
API keys e sessões revogadas não têm acesso. A autorização é novamente
verificada depois de adquirir o bloqueio de manutenção da organização.

- Somente cópias `COMPLETED` podem ser selecionadas. A cópia concluída mais
  recente fica protegida; seu arquivo é verificado antes de excluir uma
  cópia anterior. Se estiver indisponível ou corrompido, a exclusão é recusada.
- Operações `PENDING`/`RUNNING` e prévias de restauração ainda válidas impedem
  a solicitação. Aguarde sua conclusão ou a expiração da prévia.
- A resposta `202` registra `DELETING` e a auditoria de solicitação na mesma
  transação. Ela confirma o recebimento, não a remoção do arquivo.
- O worker revalida as operações e a cópia protegida sob o bloqueio de
  manutenção antes de remover o arquivo. Falha de arquivo, auditoria ou
  commit deixa a exclusão pendente para nova tentativa, inclusive após reinício.
- `DELETED` aparece somente depois da remoção do arquivo e do commit da
  auditoria de conclusão. Metadados permanecem no histórico, sem download
  ou prévia. A exclusão aceita também é concluída se a organização for desativada.
- A tela acompanha a operação automaticamente, inclusive se a primeira
  atualização do catálogo falhar. Sair da sessão encerra esse acompanhamento.

A remoção afeta o arquivo de backup escolhido. A restauração e a exclusão
em massa de dados operacionais são entregas distintas, ainda pendentes.

## Habilitação no servidor Rocky Linux

1. Confirmar o SHA da `main`, CI do mesmo SHA e gerar backup externo
   da base PostgreSQL antes de alterar a stack.
2. Configurar em `.env` privado (permissão 0600), SEM incluir a chave no Git:

   ```dotenv
   BACKUP_DIRECTORY=/var/lib/axes-crm/backups
   BACKUP_ENCRYPTION_KEY=<32 bytes em base64 canônico gerados fora do repositório>
   BACKUP_WORKER_POLL_MS=15000
   BACKUP_MAX_BYTES=67108864
   BACKUP_SNAPSHOT_TIMEOUT_MS=60000
   ```

   Gere uma chave com `openssl rand -base64 32` em sessão privada; não
   cole o valor em chats, tickets, comandos com histórico compartilhado ou logs.
   Guarde cópia cifrada da chave fora do servidor, separada dos backups.
   **Perder a chave inviabiliza a recuperação dos arquivos cifrados.**
   O download autorizado devolve JSON em texto claro: proteja imediatamente
   esse arquivo por criptografia própria e controle de acesso.

3. Confirmar que o volume nomeado `backup-data` do Compose está privado,
   pertence ao usuário `node` do container API e permite escrita; não
   alterar permissões de diretórios preexistentes de forma indiscriminada.
4. Executar as verificações do deploy com `bash scripts/deploy.sh --check-only`;
   em janela autorizada, executar `bash scripts/deploy.sh` sem
   `--bootstrap-admin`, para não redefinir a senha administrativa.
5. Provisionar associação Superusuário **somente** pelo procedimento administrativo
   `apps/api/src/scripts/provision-superuser.ts`, com IDs verificados da
   organização e do usuário e conexão administrativa restrita ao operador.
   Nunca habilitar por um formulário público nem por permissões de ADMIN.
6. Abrir a tela com o Superusuário, solicitar backup manual, verificar estado
   `COMPLETED`, conferir checksum/download, testar agendamento com dados
   sintéticos e comparar isolamento entre organizações.

## Critérios de homologação

- Backup tem estado `COMPLETED` e manifesto/checksum verificáveis, e a chave
  permite leitura. `PENDING`/`RUNNING` ou arquivo isolado não equivalem a sucesso.
- Backup de empresa A não é listável, baixável nem pré-visualizável pela empresa B.
- O painel e a API negam acesso a ADMIN comum, VIEWER e API keys.
- A exclusão de uma cópia antiga preserva a mais recente, requer confirmação,
  mantém auditoria e retoma uma remoção interrompida sem perder o catálogo.
- O worker, o volume privado e a persistência após reinício foram verificados.
- A restauração é exercitada em **cópia descartável** e não em produção,
  somente depois que sua implementação transacional passar todos os testes.
- Para liberar produção: evidências de HTTPS, login, fluxo comercial, isolamento
  RLS, restore em cópia isolada, rollback e aceite na issue #159.

A implantação de backup via interface não substitui o `pg_dump` pré-migration
nem uma estratégia independente de recuperação de desastre do PostgreSQL.
