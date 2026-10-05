# Backup e recuperação — checkpoint de desenvolvimento

Plano: docs/superpowers/plans/2026-10-05-crm-backup.md. Pendências completas: issue #86.

## Estado em 5 de outubro de 2026

Módulo em implementação. Ainda não há catálogo, exportador de snapshot, worker, rotas ou painel de backup disponíveis.

- PRs #85 e #87 mergeados: Superusuário protegido por associação, revalidação na sessão, API keys negadas, bloqueio SQL da promoção e da transferência de associação privilegiada. Testes SQL/HTTP usam papel restrito, separado do papel de fixtures.
- PR #88 mergeado após CI integral e revisão: armazenamento AES-256-GCM privado; rejeição de diretório existente com acesso de grupo/outros, sem alterar permissões de infraestrutura. Sete testes de armazenamento passaram localmente.
- Inventário explícito dos 36 modelos persistentes. Projeções excluem hashes, sessões ativas e a flag privilegiada; políticas especiais de recuperação continuam pendentes de execução.
- Este incremento acrescenta manifesto versão 1, fingerprint do esquema e das políticas, contagens e checksum SHA-256. Verificação rejeita organização errada, versão incompatível, modelos ausentes/excedentes, campos indevidos, tipos inválidos e referências de usuários fora do conjunto declarado.
- Metadados completos são gerados do schema Prisma e conferidos contra o código fonte e o cliente gerado; não dependem do DMMF parcial em runtime. O gerador executa junto com prisma:generate, inclusive na imagem Docker.
- Decimal/BigInt são representados por strings; timestamps aceitam precisão de microssegundos. Campos JSON usam texto original do PostgreSQL: a futura restauração deverá converter esse texto diretamente para JSON/JSONB, preservando valores numéricos exatos e diferenciando NULL SQL de literal JSON null.
- Configuração valida BACKUP_DIRECTORY absoluto privado e BACKUP_ENCRYPTION_KEY base64 canônico de 32 bytes, obrigatoriamente juntos. Sem configuração, o aplicativo atual continua funcionando. Limite padrão: 64 MiB (1–256 MiB); timeout de snapshot padrão: 60 s (1–300 s).
- Falha de fsync após publicação pode deixar um objeto criptografado; o futuro catálogo/worker deverá verificar e reconciliar o objeto. Sua existência nunca significa backup concluído.

## Evidências e limites

- PR #87: CI 37254071582 completo, incluindo PostgreSQL 18, papel sem BYPASSRLS, 71 suítes/312 testes da API, seis E2E e imagens Docker.
- PR #88: CI 37297848737 completo, incluindo testes SQL/HTTP, seis E2E e imagens Docker; revisão sem bloqueios.
- Manifesto: quatro testes falharam com as funções ainda não implementadas e passaram após implementação. Configuração: regressão falhou na versão anterior e passou após implementação.
- Incremento atual: 20 testes locais de manifesto, inventário, configuração e armazenamento aprovados; tipos e build da API e formatação aprovados. Validação integral deste incremento será registrada após CI.
- O ambiente local recuperado não tem PostgreSQL/Docker configurados. Validação real de migrações/RLS continua obrigatória no CI; nenhum banco de produção é usado.

## Próximas entregas

Conectar manifesto e inventário a catálogo sob RLS e exportação RepeatableRead com teste real de concorrência. Em seguida: worker/agenda/retenção, prévias/confirmações, bloqueios de escrita, restauração, exclusão, API e painel. Não encerrar a issue #86 por este incremento.
