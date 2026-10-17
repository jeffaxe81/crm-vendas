# Capacidade lógica de backup por tenant — primeira entrega

Cada empresa pode registrar uma **alocação de referência**, de 1 a 10240 GiB,
ou mantê-la sem valor definido. A política é independente do expurgo, do
agendamento e do prazo de retenção dos backups.

- GET/PUT `/api/v1/admin/storage/allocation` exigem sessão humana de
  Superusuário; chaves de API e administradores comuns não são autorizados.
- Ajustar a capacidade exige a frase literal `AJUSTAR COTA`, gravada com
  auditoria por tenant. A política reside em
  `tenant_storage_allocations`, com RLS forçado e bloqueio de manutenção.
- O consumo é calculado pelo **catálogo de backups criptografados**:
  `byte_count` de backups nos estados `COMPLETED` e `DELETING` para a
  organização autenticada. Não inclui banco de dados PostgreSQL, anexos fora
  do catálogo, objetos órfãos ou a sobrecarga de criptografia no disco.
- O painel mostra contagem de backups, volume catalogado e percentual da
  alocação, sinalizando 80% e 100%. Sem valor de referência, não há
  percentual nem alerta de limite.
- **A alocação é indicativa, NÃO uma quota física nem limite de gravação.**
  Não expande volumes Docker, espaço no filesystem nem a capacidade do banco.
  Também não bloqueia backups acima da referência; enforcement requer
  reservas transacionais antes da escrita, que não fazem parte desta fase.
- A tabela é operacional (SQL-only), deliberadamente **não exportada ou
  substituída** por snapshot de dados comerciais do CRM.
- A exclusão de backups pode reduzir o volume catalogado, mas só a limpeza
  real do objeto pelo worker libera espaço no volume. Os estados `DELETING`
  permanecem contabilizados até sua conclusão.

## Homologação e operação

1. Aplicar migrações via `db-migrate` do Compose e reconstruir API e Web.
2. Confirmar que o usuário restrito da aplicação tem acesso à nova tabela
   e que sua política RLS impede consultas entre tenants.
3. Acessar Administração → Backup e recuperação como Superusuário.
4. Conferir a contagem e o volume de backups em cada tenant.
5. Definir capacidade, confirmar, alternar de tenant e provar o isolamento.
6. Confirmar o evento de auditoria `storage.allocation_changed`.
7. Verificar a capacidade física real do volume de backups separadamente,
   antes de prometer aumento de armazenamento contratado.

Esta entrega NÃO executa exclusão, alteração da política de expurgo ou
redimensionamento automático de volume.
