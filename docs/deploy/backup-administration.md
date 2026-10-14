# CRM-Vendas — painel de backup (entrega inicial controlada)

## Estado

A tela **Administração → Backup e recuperação** e os endpoints `/api/v1/admin/backups`
são exclusivamente para a sessão humana com atributo protegido `isSuperuser`
na empresa ativa. Administradores comuns e API keys não têm acesso.

Esta entrega disponibiliza catálogo, fila manual, agenda/retenção, download
autenticado e prévia verificada. **Restauração efetiva, exclusão manual e
limpeza de dados NÃO estão habilitadas**. Não interpretar prévia como restore.

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
- O worker, o volume privado e a persistência após reinício foram verificados.
- A restauração é exercitada em **cópia descartável** e não em produção,
  somente depois que sua implementação transacional passar todos os testes.
- Para liberar produção: evidências de HTTPS, login, fluxo comercial, isolamento
  RLS, restore em cópia isolada, rollback e aceite na issue #159.

A implantação de backup via interface não substitui o `pg_dump` pré-migration
nem uma estratégia independente de recuperação de desastre do PostgreSQL.
