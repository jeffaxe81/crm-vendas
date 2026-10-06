# Backup e recuperação — checkpoint de desenvolvimento

Plano: docs/superpowers/plans/2026-10-05-crm-backup.md. Pendências completas: issue #86.

## Estado em 5 de outubro de 2026

Módulo em implementação. PR #90 foi integrado à main com catálogo e exportador internos validados. Ainda não há worker, rotas ou painel de backup disponíveis. O recurso completo não está entregue.

- PRs #85 e #87 mergeados: Superusuário protegido por associação, revalidação na sessão, API keys negadas, bloqueio SQL da promoção e da transferência de associação privilegiada. Testes SQL/HTTP usam papel restrito, separado do papel de fixtures.
- PR #88 mergeado após CI integral e revisão: armazenamento AES-256-GCM privado; rejeição de diretório existente com acesso de grupo/outros, sem alterar permissões de infraestrutura. Sete testes de armazenamento passaram localmente.
- Inventário explícito dos 39 modelos persistentes no PR #90; BackupRecord, DataOperation e BackupSchedule ficam excluídos da cópia/restauração. Projeções excluem hashes, sessões ativas e a flag privilegiada; políticas especiais de recuperação continuam pendentes de execução.
- PR #89, já mergeado com CI integral aprovado, acrescenta manifesto versão 1, fingerprint do esquema e das políticas, contagens e checksum SHA-256. Verificação rejeita organização errada, versão incompatível, modelos ausentes/excedentes, campos indevidos, tipos inválidos e referências de usuários fora do conjunto declarado.
- Metadados completos são gerados do schema Prisma e conferidos contra o código fonte e o cliente gerado; não dependem do DMMF parcial em runtime. O gerador executa junto com prisma:generate, inclusive na imagem Docker.
- Decimal/BigInt são representados por strings; timestamps aceitam precisão de microssegundos. Campos JSON usam texto original do PostgreSQL: a futura restauração deverá converter esse texto diretamente para JSON/JSONB, preservando valores numéricos exatos e diferenciando NULL SQL de literal JSON null.
- Configuração valida BACKUP_DIRECTORY absoluto privado e BACKUP_ENCRYPTION_KEY base64 canônico de 32 bytes, obrigatoriamente juntos. Sem configuração, o aplicativo atual continua funcionando. Limite padrão: 64 MiB (1–256 MiB); timeout de snapshot padrão: 60 s (1–300 s).
- Falha de fsync após publicação pode deixar um objeto criptografado; o futuro catálogo/worker deverá verificar e reconciliar o objeto. Sua existência nunca significa backup concluído.

## Evidências e limites

- PR #87: CI 37254071582 completo, incluindo PostgreSQL 18, papel sem BYPASSRLS, 71 suítes/312 testes da API, seis E2E e imagens Docker.
- PR #88: CI 37297848737 completo, incluindo testes SQL/HTTP, seis E2E e imagens Docker; revisão sem bloqueios.
- Revisão do manifesto: corrigida aceitação de datas normalizadas, VarChar acima do limite, overflow SmallInt e precisão/escala Decimal. Duas regressões reproduziram a falha e passaram após correção; valores decimais exatos também tiveram round-trip validado. Não há coluna BigInt no conjunto exportável atual para um round-trip real desse tipo.
- Manifesto: quatro testes falharam com as funções ainda não implementadas e passaram após implementação. Configuração: regressão falhou na versão anterior e passou após implementação.
- Incremento atual: 22 testes locais de manifesto, inventário, configuração e armazenamento aprovados; tipos e build da API e formatação aprovados. CI integral do manifesto: 37299100907 aprovado; merge #89 em f3098d8b9b79ed4114066575296cc4a03db12d5b.
- O ambiente local recuperado não tem PostgreSQL/Docker configurados. Validação real de migrações/RLS continua obrigatória no CI; nenhum banco de produção é usado.

## Próximas entregas

Catálogo/snapshot do PR #90 validado e mergeado no commit da9e1ac375b008aa73de4b8b9109b51ee7761085. O serviço interno exporta em RepeatableRead, aplica escopo/projeções antes de serializar e só conclui o catálogo após leitura/verificação do arquivo persistido. Conclusão e auditoria compartilham uma transação; falhas tentam limpar o arquivo e registrar estado FAILED, deixando estados não concluídos para a futura reconciliação se o banco estiver indisponível. Em seguida: worker/agenda/retenção, prévias/confirmações, bloqueios de escrita, restauração, exclusão, API e painel. Não encerrar a issue #86 por este incremento.

## Validação do catálogo/snapshot — concluída

- CI 37299341440: quatro testes PostgreSQL de catálogo falharam com ausência das tabelas (42P01) antes da migration; demais 321 testes passaram.
- CI 37300794988: os quatro testes do catálogo passaram após a migration sob papel restrito; sete testes de snapshot falharam com serviço ainda não implementado, incluindo auditoria obrigatória. Essa execução não é aprovação da entrega.
- Fixture de credencial foi corrigida para escopos não vazios após um primeiro erro de preparação; esse erro de fixture não foi contado como prova de comportamento ausente.
- Implementação local: 24 testes direcionados, tipos/build da API e formatação aprovados. Revisão do incremento sem bloqueios. CI 37301257376 aprovou PostgreSQL, 75 suítes/333 testes da API e build, mas o E2E não iniciou por falta de token explícito de injeção do PrismaService em execução tsx. Corrigido conforme o padrão dos serviços existentes; regressão Nest sem metadados inferidos falhou antes da correção e passou depois. CI final 37302398802 aprovado: 75 suítes/334 testes da API, seis E2E e imagens Docker.
- Conjunto de testes reais cobre snapshot estável com alteração concorrente, isolamento, exclusão de segredos/controles, valores decimais/JSON/microssegundos, corrupção/versão, disco cheio, rejeição de administrador comum, ausência de configuração, coluna desconhecida e falha da auditoria de conclusão.
- Mantidos incrementos pequenos e já publicados para evitar perda de trabalho não enviado. Isso acrescenta execuções de revisão/CI; nenhuma rota incompleta é ativada.
- Cobertura adicional de armazenamento para permissões apenas de grupo e read/remove fica pendente; o teste existente verifica diretório compartilhado e o método comum é usado nas três operações.

- Revisão: a proteção de anexos usa o inventário atual e detecção por nomes/Bytes. Não há modelo de anexos nesta versão; política explícita e teste de rejeição deverão acompanhar a introdução de armazenamento de anexos.

## Worker, agenda e retenção — em andamento

PR #91 em draft. Cálculo de agenda diária, semanal e por intervalo validado em seis testes locais, incluindo fuso de São Paulo, limites de retenção e horário de verão histórico. Testes reais de concorrência, lease e checkpoint foram publicados antes da implementação do worker. Ainda não há worker ativo ou agendamento disponível no produto.


## Bloqueio, prévia e restauração — iniciado em 6 de outubro de 2026

Após o merge do PR #91, a Task 4 foi iniciada em branch isolada `feat/crm-backup-restore`. A primeira microentrega implementa a fundação de bloqueio de escritas por organização: escritas comuns adquirem advisory lock compartilhado por trigger e a rotina interna de manutenção adquire lock exclusivo transacional. Assim, escrita já iniciada conclui antes da manutenção; novas escritas da mesma organização aguardam; outra organização permanece independente. Há teste de cobertura para exigir o trigger em toda tabela atual com `organization_id` e na raiz `organizations`.

Ainda não declarar restauração disponível. Permanecem prévia persistente, reautenticação/confirmação, cópia preventiva, preparação/validação do snapshot, substituição transacional, revogação de sessões e integração do worker.
