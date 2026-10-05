# Backup e recuperação — checkpoint de desenvolvimento

Plano: docs/superpowers/plans/2026-10-05-crm-backup.md.

## Estado

Etapa 1 em desenvolvimento. Nenhuma tela de backup, restauração ou exclusão disponível. Não instalar esta branch como release concluída.

- Atributo protegido is_superuser na associação por organização, default false.
- Guard restrito a sessão humana; ADMIN e API key não têm acesso apenas por suas permissões.
- Autenticação consulta o atributo na associação corrente, sem confiar no token para decidir Superusuário.
- Migration impede que o papel de banco da aplicação conceda o atributo; comando de implantação permite concessão/revogação por IDs explícitos e registra auditoria.
- Contrato de sessão e cliente Prisma regenerado para o schema atual.

## Validações executadas

- Frontend existente: 47 arquivos / 212 testes passaram antes das alterações; nenhuma alteração de frontend nesta etapa.
- API unitária existente: 20 suítes / 111 testes passaram.
- Guard novo: 5 testes passaram, após execução inicial falhar pela ausência da implementação.
- Typecheck API passou antes da formatação; repetição final registrada no registro de trabalho.
- Suíte completa API: 46 suítes falharam / 21 passaram; 183 testes falharam / 116 passaram. Causas ambientais: configuração de banco/autenticação não fornecida e PostgreSQL ausente. Não representa aprovação dos testes de integração.
- Suíte de contratos do repositório bloqueada por docker ENOENT em tests/container-contract.test.mjs.

## Bloqueio comprovado

Docker e servidor PostgreSQL não estão instalados. Instalação via apt encontrou restrições de troca de usuário e locks do sistema; PostgreSQL exige execução sem root, mas setpriv --reuid=1000 falhou com Invalid argument. Nenhum banco de produção foi acessado. Não substituir testes de isolamento, migração e restauração por mocks.

## Próximo passo

Executar em ambiente com PostgreSQL descartável e Docker, configurar DATABASE_URL, MIGRATION_DATABASE_URL e APP_DATABASE_URL (papel sem BYPASSRLS), aplicar migrações e concluir os testes de provisionamento, revogação e tentativa de promoção via API/SQL. Retomar as etapas 2–8 do plano somente depois dessa base validada. O módulo completo ainda não foi implementado.

## Decisões registradas

- Worktree isolado criado para a execução autorizada, preservando a branch do desenho.
- isSuperuser é opcional no contrato de sessão para compatibilidade com consumidores existentes; ausência sempre equivale a false.
- Regeneração do cliente Prisma incluiu a atualização acumulada do schema presente no repositório; necessária para os tipos atuais, sem alteração adicional do modelo de negócio.
