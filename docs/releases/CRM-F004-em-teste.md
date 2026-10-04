# CRM-F004 — Espaço de trabalho — EM TESTE

Branch de distribuição: `feat/crm-workspace-testing`. Esta entrega não aprova implantação em produção.

## Melhorias

- Navegação agrupada em Comercial, Produtividade, Atendimento, Gestão e Administração, filtrada pelas permissões do usuário.
- Tela inicial com favoritos, agenda do dia e indicadores; escolha da página inicial, ordem e visibilidade dos componentes.
- Preferências por usuário e organização persistidas na API, com salvamento explícito e restauração como rascunho.
- Administração de usuários/perfis, filas e políticas de SLA pelos endpoints existentes.
- Indicadores abrem o relatório relacionado; comunicação preserva sua montagem durante a navegação.
- Componentes ocultos aguardam as preferências e não consultam dados na tela inicial.

## Atualização no PowerShell

Execute na pasta do repositório, com alterações locais previamente preservadas:

```powershell
git fetch origin
git switch feat/crm-workspace-testing
git pull --ff-only origin feat/crm-workspace-testing
docker compose up -d postgres
docker compose --profile tools run --rm --build migrate
docker compose up -d --build api web
docker compose ps
```

Não remova o volume do PostgreSQL. A migração adiciona uma tabela com vínculo ao usuário/organização e RLS. O serviço opcional `migrate` utiliza o estágio de build, que contém o Prisma CLI e o schema. Em desenvolvimento local, regenere o cliente com `pnpm --filter @axes/api prisma:generate`.

A auditoria do salvamento e as preferências são gravadas na mesma transação. A importação do layout anterior do navegador é opcional e só persiste após clicar Salvar preferências.

## Verificação realizada

- Frontend: 212 testes, 47 arquivos, aprovados.
- Contratos: 92 testes, 19 arquivos, aprovados.
- API: 98 testes unitários, 18 suites, aprovados.
- Typecheck e build do frontend; build da API aprovados.
- Regressões de GET/PUT atrasados após troca de identidade, resposta após logout, sanitização de destinos revogados e consultas de widgets ocultos aprovadas.
- Revisão independente concluída; correções aplicadas em uma rodada e verificadas pelos testes.

## Validação pendente antes de promoção

Docker não está disponível neste ambiente. Integração depende de PostgreSQL e variáveis de autenticação; E2E foi bloqueado na inicialização do servidor (`tsx`, `listen EPERM`). Esses testes não foram aprovados aqui.

Validar migração e RLS em banco real, acesso por API key, vínculo inativo, revogação de permissões e rollback de auditoria. Ampliar integração para o mesmo usuário em organizações diferentes. Executar E2E e inspeção visual em desktop e celular, incluindo persistência em outro navegador e navegação com teclado. A cobertura unitária não substitui esses aceites.

Para regressão operacional, voltar à branch/versão anterior da aplicação. A tabela adicional pode permanecer; não excluir dados nem reverter migrações sem procedimento próprio.
