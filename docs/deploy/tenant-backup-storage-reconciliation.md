# Reconciliação somente leitura de backups por tenant

Implementação de diagnóstico de armazenamento no CRM. O Superusuário utiliza
**Administração → Backup e recuperação → Conferência dos arquivos de backup**.

## Contrato

- `GET /api/v1/admin/storage/reconciliation`, com autenticação e guarda de
  Superusuário, sem cache, consulta até **50 backups concluídos mais recentes**
  pertencentes ao tenant autenticado.
- A API faz consulta tenant-scoped sob RLS e depois verifica exclusivamente os
  caminhos derivados dos UUIDs que apareceram nesse resultado. Não percorre
  diretórios globais nem revela nomes de caminhos do servidor.
- Para cada objeto, utiliza abertura `O_NOFOLLOW` e `fstat`, sem ler
  conteúdo; arquivos simbólicos e objetos não regulares são recusados.
- `backups.byte_count` representa o comprimento dos dados **antes**
  do envelope AES-GCM. O arquivo físico inclui **36 bytes** adicionais:
  identificador AXESBK01 (8), IV (12), tag (16). A comparação considera
  essa diferença.
- O diagnóstico distingue `MISSING` (objeto ausente),
  `SIZE_MISMATCH` (tamanho diferente) e `UNREADABLE` (erro de
  acesso ou tipo de arquivo não permitido). Nenhum desses estados altera
  o catálogo ou os arquivos.
- `complete=false` significa amostra parcial, inclusive quando backups
  existem mas o armazenamento não está configurado.
- `COMPLETED` é o único estado incluído nesta conferência: arquivos
  em exclusão podem desaparecer legitimamente durante o processo.

## Limitações

**Não comprova integridade criptográfica**, restaurabilidade ou consistência
dos dados; essas garantias exigem verificação completa e restauração de
homologação. Não identifica objetos órfãos sem referência no catálogo, nem
mede dados PostgreSQL ou anexos externos. Não amplia volume físico, não
bloqueia backups e não executa limpeza automática.

## Homologação

1. Confirmar os testes unitários do `BackupStore.objectSize`, incluindo
   arquivo ausente, ID inválido e link simbólico.
2. Confirmar RLS e consultas entre tenants nos testes de integração.
3. Testar o endpoint sem token (401) e com administrador comum (403).
4. Testar em ambiente Docker com backup real; conferir tamanho do objeto:
   dados catalogados + 36 bytes.
5. Simular backup ausente em laboratório, nunca em produção, e confirmar
   que o sistema apenas sinaliza `MISSING` sem excluir ou recriar arquivos.

A reconciliação é uma etapa preparatória para cotas efetivas. Enforcement
com reservas transacionais de capacidade permanece fora do escopo.
