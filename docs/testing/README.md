# Estratégia de testes — CRM Axesistemas

## Testes

| Nível | Ferramenta | Escopo |
| --- | --- | --- |
| Repositório | Node test runner | Versões fixadas e contrato Compose |
| Contratos | Vitest | Schemas e tipos compartilhados |
| Web | Vitest + Testing Library | Readiness, login e estado de sessão |
| API | Jest | Health, configuração, erros, auth, RBAC e auditoria |
| Integração | Jest + PostgreSQL | Prisma, migration, sessão, isolamento multiempresa e append-only |
| E2E | Playwright | Jornada browser de login, sessão ativa e logout |
| Container | Docker Compose | Topologia, dependências, health checks e build das imagens |

Comandos:

```bash
pnpm test:repo
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm verify
```

Qualidade é medida por comportamentos protegidos, não por um percentual genérico de cobertura.

### Controles específicos do Ciclo 1

A suíte de integração deve provar:

- autenticação válida e resposta neutra para credenciais inválidas;
- cookie de refresh com atributos de segurança esperados;
- rotação do refresh token;
- detecção de reutilização do token antigo e revogação da família;
- logout com invalidação da sessão associada ao access token;
- bloqueio após desativação de usuário ou membership;
- organização ativa derivada da sessão;
- tentativa de alteração de membership de outra organização rejeitada;
- perfil sem `user.manage` bloqueado nos endpoints administrativos;
- auditoria de autenticação sem senha ou hash do refresh token;
- `audit_logs` protegido contra DELETE/UPDATE pela aplicação comum.

## Pré-requisitos

O PostgreSQL deve estar saudável para testes de integração e E2E. Em instalação limpa, o Prisma Client e as migrations precisam ser preparados antes do gate:

```bash
docker compose up -d postgres
pnpm --filter @axes/api prisma:generate
pnpm --filter @axes/api prisma:migrate:deploy
```

Para o E2E autenticado, as variáveis `BOOTSTRAP_*`, `JWT_ACCESS_SECRET` e `REFRESH_TOKEN_PEPPER` devem estar definidas no ambiente de teste.

## Inicialização

O CI parte de um PostgreSQL vazio, aplica a migration versionada, executa a suíte automatizada e somente depois cria o administrador usado pelo Playwright. Isso evita que os testes dependam de banco pré-preenchido.

## Validação

O gate do ciclo executa, na ordem:

1. instalação por lockfile;
2. geração do Prisma Client;
3. `prisma migrate deploy`;
4. documentação, Prettier, lint, typecheck, testes e build;
5. bootstrap administrativo para E2E;
6. Playwright;
7. `docker compose config`;
8. build das imagens API e Web.

Uma falha em qualquer etapa impede checkpoint, tag e merge.

## Arquitetura

Os testes seguem os limites dos pacotes. Contratos, Web e API são verificáveis separadamente; testes de integração exercitam PostgreSQL real e os E2E cobrem a jornada do usuário pelo navegador.

Os testes multiempresa devem preferir cenários com duas organizações reais e tentar explicitamente cruzar seus identificadores. Não é suficiente verificar apenas o caminho positivo da organização ativa.

## Retorno

Falha no gate impede o checkpoint do ciclo. Para o Ciclo 1, o último checkpoint aprovado continua sendo `v0.0.0-foundation` até a criação de uma nova tag após o gate integral verde.

## Changelog

Mudanças de cobertura, regressões e novos controles de segurança devem ser registradas junto ao ciclo correspondente em `CHANGELOG.md` e no PR de validação.
