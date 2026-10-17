# Política de expurgo por tenant — entrega inicial

Cada organização tem política independente, armazenada na tabela
`purge_policies`, protegida por RLS e por bloqueio de manutenção. O padrão
é **desativado**. Apenas uma sessão humana com privilégio de Superusuário da
organização pode consultar ou alterar a política nas rotas
`GET/PUT /api/v1/admin/purge/policy`. Habilitar requer a frase
`ATIVAR EXPURGO`, informada de forma explícita na tela Administração →
Backup e recuperação. A troca de tenant troca integralmente a configuração.

## Escopo atual, propositalmente restrito

A rotina elimina **somente prévias expiradas de operações administrativas**
(`operation_previews`) cuja expiração ocorreu antes da janela de retenção
configurada. Não toca nas prévias ainda válidas, nos dados de negócio,
gravações/anexos, filas, históricos de webhooks, credenciais, usuários,
backups, logs de auditoria ou registros de execução de operações. Não
substitui a restauração efetiva nem a limpeza de dados operacionais.

As tentativas de webhook são imutáveis por política de banco, por isso não são
alvo de expurgo nesta entrega. Expurgo de cadastros, contatos, oportunidades,
tickets ou auditoria exige avaliação de dependências, regras de negócio,
retenção legal, cópia preventiva restaurável e homologação separada.

## Execução e segurança

- Retenção independente por tenant: 30 a 3650 dias; padrão de 180 dias.
- A rotina é acionada na inicialização da API e checada a cada hora, mas cada
  tenant habilitado executa no máximo uma passagem a cada 24 horas.
- Cada passagem remove até 500 prévias expiradas da organização.
- Seleção, exclusão, atualização da data de execução e auditoria ocorrem
  na **mesma transação**, sob bloqueio consultivo exclusivo por tenant. Falha
  na auditoria implica rollback integral.
- Erros da rotina são registrados no log do servidor; a última execução pode
  ser consultada na interface. Para acompanhar a contagem removida, examine
  eventos `purge.expired_previews_completed` na auditoria do tenant.
- O expurgo lógico de linhas não reduz imediatamente o tamanho do arquivo do
  PostgreSQL; sua manutenção de espaço segue o VACUUM/rotinas DBA. Não
  configura quota física do volume nem limite de armazenamento do tenant.

## Implantação

A migração é aplicada pela etapa existente de `db-migrate` no Compose; a
API precisa ser reconstruída para reconhecer o novo modelo Prisma. Com o
diretório de trabalho sem alterações conflitantes:

```bash
cd /desenv/crm-vendas && sudo git pull --ff-only origin main && sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose build api web && sudo docker compose up -d --force-recreate --wait api web && sudo docker compose ps -a
```

**Nunca** execute expurgo diretamente no PostgreSQL de produção, bypass RLS
ou `TRUNCATE` para contornar a política. Retenção de arquivos de backup é
uma configuração separada do agendamento de backups; não é alterada aqui.
