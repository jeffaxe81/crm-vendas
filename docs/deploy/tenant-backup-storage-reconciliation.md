# Reconciliação somente leitura de backups por tenant

Implementação de diagnóstico de armazenamento no CRM. O Superusuário utiliza
**Administração → Backup e recuperação → Conferência dos arquivos de backup**.

## Contrato

- `GET /api/v1/admin/storage/reconciliation`, com autenticação e guarda de
  Superusuário, sem cache, consulta **até 50 backups concluídos por requisição**
  pertencentes ao tenant autenticado. O campo `nextCursor` permite consultar o
  próximo lote usando `?cursor=<UUID>` até que seja `null`. A interface exige
  clique para cada lote: não varre automaticamente todos os registros.
- O servidor valida o formato do cursor e confirma seu pertencimento ao mesmo
  tenant e estado `COMPLETED`, sob RLS. Cursor inválido, de outro tenant,
  ausente ou excluído retorna HTTP 400; não há fallback para outro escopo.
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
- `complete=false` significa que há mais lotes no catálogo ou que o
  armazenamento não está configurado. A interface soma contadores e achados
  entre os lotes efetivamente percorridos; cada resposta do backend descreve
  somente seu lote (`checkedCount` até 50).
- `COMPLETED` é o único estado incluído nesta conferência: arquivos
  em exclusão podem desaparecer legitimamente durante o processo.

## Limitações

**Não comprova integridade criptográfica**, restaurabilidade ou consistência
dos dados; essas garantias exigem verificação completa e restauração de
homologação. Não identifica objetos órfãos sem referência no catálogo, nem
mede dados PostgreSQL ou anexos externos. Os lotes são consultas sucessivas,
**não um snapshot único**: backups criados, removidos ou alterados durante a
conferência podem mudar a contagem/ordem. Reinicie a conferência para uma nova
observação; não use a saída como prova de inventário consistente para limpeza. Não amplia volume físico, não
bloqueia backups e não executa limpeza automática.

## Homologação

1. Confirmar os testes unitários do `BackupStore.objectSize`, incluindo
   arquivo ausente, ID inválido e link simbólico.
2. Confirmar RLS e consultas entre tenants nos testes de integração.
3. Testar o endpoint sem token (401), com administrador comum (403) e com
   cursor inválido, apagado ou pertencente a outro tenant (400).
4. Testar em ambiente Docker com backup real; conferir tamanho do objeto:
   dados catalogados + 36 bytes.
5. Simular backup ausente em laboratório, nunca em produção, e confirmar
   que o sistema apenas sinaliza `MISSING` sem excluir ou recriar arquivos.
6. Criar 53 backups concluídos sintéticos em laboratório e verificar duas
   páginas (50 + 3), sem repetição de UUIDs, sem acesso a registros de
   outra organização e sem varredura automática no navegador.

A reconciliação é uma etapa preparatória para cotas efetivas. Enforcement
com reservas transacionais de capacidade permanece fora do escopo.

## Inventário global de objetos físicos — candidato isolado

A microentrega da PR #306 propõe o endpoint de diagnóstico
`GET /api/v1/admin/storage/inventory`. O endpoint exige sessão humana
autenticada com `isSuperuser=true`, recusa parâmetros de consulta (inclusive
`organizationId`) e responde `Cache-Control: no-store`.
A implementação permanece isolada até aprovação do gate da branch e não
autoriza seu uso em produção.

Diferentemente da reconciliação paginada por tenant, o inventário global
percorre o catálogo de **todas** as organizações, usando exclusivamente
`PrismaService.withTenant(organizationId)` para cada página de até 200
backups. O papel de banco da API permanece restrito, com FORCE RLS, sem
credencial de migração ou `BYPASSRLS`. O diretório privado é enumerado
sem seguir symlinks e sem retornar caminhos físicos, nomes inesperados,
segredos ou conteúdo criptografado.

O resultado possui `readOnly: true`, `scope: ALL_ORGANIZATIONS`,
`atomicSnapshot: false`, `configured`, `complete`, totais por
organização e ocorrências sanitizadas por UUID. Ele distingue:

- `ORPHAN`: objeto físico sem referência em qualquer estado do catálogo;
- `MISSING`: backup `COMPLETED` sem objeto físico observado;
- `SIZE_MISMATCH`: tamanho físico distinto de `byteCount + 36`;
- `UNREADABLE`: objeto com UUID que não pôde ser inspecionado de modo seguro;
- `STATE_INCONSISTENCY`: objeto físico com registro `DELETED`;
- temporários e nomes inesperados: **apenas contadores**, sem seus nomes.

Backups `PENDING`, `RUNNING` e `DELETING` não são marcados
como ausentes. Um UUID físico presente mas ilegível pode também ser
classificado como órfão, se não houver registro correspondente. Sem
armazenamento configurado, `configured=false` e `complete=false`.

A contagem física por organização inclui também entradas UUID ilegíveis que
possuem referência no catálogo, de forma consistente com a contagem global.
Os totais de bytes incluem somente tamanhos que puderam ser inspecionados.
Um registro `DELETED` com entrada ilegível produz tanto `UNREADABLE` quanto
`STATE_INCONSISTENCY`, sem abrir o destino de um symlink.

**Limites obrigatórios:** a comparação entre PostgreSQL e filesystem
não é um snapshot atômico; alterações simultâneas podem afetar o resultado.
O inventário não autentica o envelope AES-GCM, não prova restaurabilidade
e não autoriza limpeza, alteração de catálogos, aplicação de cotas, deploy
nem GO operacional. Antes de produção, homologar a autorização global,
a volumetria, o isolamento real, as evidências e o aceite formal.

## Consulta na administração

A seção **Inventário global de backups**, no painel **Backup e recuperação**,
consulta o endpoint somente após clique de um Superusuário. O resultado inclui
totais e consumo conhecido por empresa, com filtro por tipo de ocorrência.
As tabelas exibem até 20 linhas por página; paginação e filtros são locais e
não disparam novas varreduras. Uma nova consulta substitui o resultado anterior.

A interface valida a resposta antes de apresentar números, preserva bytes
como inteiros exatos e descarta resultados ao trocar de sessão/token.
Armazenamento indisponível, relatório parcial e falha de consulta são estados
distintos. Não oferece exclusão, reparo ou alteração de cotas.
