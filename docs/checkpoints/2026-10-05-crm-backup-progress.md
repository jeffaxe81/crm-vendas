# Backup e recuperação — checkpoint de desenvolvimento

Plano: docs/superpowers/plans/2026-10-05-crm-backup.md. Pendências completas: issue #86.

## Estado em 5 de outubro de 2026

Não há tela, rotas, snapshot ou restauração disponíveis. Este incremento entrega a proteção de autorização e o adaptador privado de arquivos; não é uma release completa do módulo.

- Superusuário é atributo separado por associação usuário/organização, sem promoção automática. A autenticação relê a associação em cada requisição; API keys recebem false.
- Migration bloqueia concessão/revogação pelo papel comum e transferência de associação privilegiada para outro ID, usuário ou organização. O comando de implantação usa IDs explícitos e registra auditoria.
- Testes PostgreSQL/HTTP usam conexão restrita no aplicativo de teste, com conexão de implantação separada exclusivamente para fixtures e limpeza. Cobrem revogação na mesma sessão, isolamento por organização, sessão revogada, API keys, payloads comuns e SQL direto.
- BackupStore usa AES-256-GCM com chave externa de 32 bytes e autenticação vinculada ao UUID. O adaptador ainda não está conectado ao Nest, catálogo ou configuração de ambiente.
- Arquivos são publicados atomicamente por hard link, sem sobrescrita concorrente, após fsync. Diretório 0700 e arquivos 0600; leitura limita o tamanho e rejeita symlinks.
- Falha de fsync após publicação pode deixar objeto criptografado. O futuro catálogo/worker deverá verificar e reconciliar esse objeto; existência de arquivo nunca significa backup concluído. Teste de injeção dessa falha integra a próxima etapa de catálogo/worker.

## Evidências e limites

- Oito testes locais de armazenamento e ordenação passaram; checagem de tipos da API passou.
- A ordenação mantém CREATED antes de ASSIGNED no mesmo instante e preserva a precisão original da ordem SQL quando Date perde microssegundos.
- CI anterior passou por migrações, repositório, contratos, frontend, API e build. Encontrou dois testes E2E com expectativas do layout anterior; foram corrigidos e a nova rodada está em execução.
- O ambiente local não tem PostgreSQL/Docker. Migrações e testes reais de banco são executados no CI com PostgreSQL 18 e papel sem BYPASSRLS. Nenhum banco de produção foi acessado.
- A nova proteção de transferência foi identificada durante revisão do código. O teste de regressão não foi executado contra a migration antiga localmente devido à ausência do banco; sua validação real depende do CI.

## Próximas entregas

Concluir validação real da autorização; depois implementar catálogo sob RLS, manifesto e inventário explícito de modelos, snapshot RepeatableRead e política para identidades compartilhadas. Agenda/worker, prévias e confirmações, bloqueios de escrita, restauração, exclusão, API e painel seguem pendentes. Não encerrar a issue #86 apenas por este incremento.
