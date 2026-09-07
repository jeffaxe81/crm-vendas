# Estratégia de testes — CRM Axesistemas

## Testes

| Nível       | Ferramenta               | Escopo                                                                      |
| ----------- | ------------------------ | --------------------------------------------------------------------------- |
| Repositório | Node test runner         | Versões fixadas e contrato Compose                                          |
| Contratos   | Vitest                   | Schemas e tipos compartilhados                                              |
| Web         | Vitest + Testing Library | Login, sessão, Empresas, Contatos, tags e campos customizados                |
| API         | Jest                     | Health, configuração, erros, auth, RBAC, auditoria e regras do CRM Core     |
| Integração  | Jest + PostgreSQL        | Prisma, migrations, sessão, isolamento multiempresa e persistência real     |
| E2E         | Playwright               | Jornada browser de autenticação, CRM Core, reload e persistência             |
| Container   | Docker Compose           | Topologia, dependências, health checks e build das imagens                  |

Comandos:

```bash
pnpm test:repo
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm verify
```

Qualidade é medida por comportamentos protegidos, não por um percentual
genérico de cobertura.

### Controles específicos do Cycle 1

A suíte de integração prova:

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

### Controles específicos do Cycle 2

A suíte automatizada do CRM Core deve provar:

- Empresa pode ser criada, listada, editada e excluída logicamente somente na
  organização ativa;
- identificador de Empresa de outro tenant retorna 404 para leitura e mutação;
- `VIEWER` recebe 403 ao tentar criar Empresa;
- Contato pode existir sem Empresa;
- Contato de outro tenant retorna 404 para leitura e mutação;
- `VIEWER` recebe 403 ao tentar criar Contato;
- canais são isolados por organização e o canal principal é mantido
  transacionalmente por tipo;
- vínculo empresa–contato exige que os dois lados pertençam à organização
  ativa;
- histórico aceita Empresa, Contato ou ambos e rejeita alvo inexistente,
  excluído ou pertencente a outro tenant;
- Tags são únicas por nome normalizado dentro da organização, mas podem ser
  reutilizadas por outra organização;
- vínculos de Tags com Empresa ou Contato de outro tenant são rejeitados;
- campos customizados validam organização, escopo, definição e tipo do valor;
- leitura e escrita de campos customizados não cruzam organizações;
- operações relevantes criam auditoria com `organizationId`, ator e
  `x-request-id`;
- auditoria de autenticação não contém senha nem hash do refresh token;
- restauração de sessão usa refresh cookie HttpOnly e não dispara rotação
  duplicada sob React Strict Mode.

### Jornada E2E do CRM Core

`tests/e2e/crm-core.spec.ts` cobre a jornada integrada pelo navegador:

1. autenticar o administrador de teste;
2. criar uma Empresa;
3. navegar para Contatos;
4. criar um Contato independente;
5. incluir canal de e-mail;
6. vincular o Contato à Empresa;
7. registrar histórico de relacionamento;
8. recarregar a página;
9. restaurar a sessão pela rotação segura do refresh cookie;
10. verificar que Empresa, Contato, canal e histórico continuam persistidos.

O cenário não deve ser considerado aprovado se depender apenas de estado em
memória da interface.

## Pré-requisitos

O PostgreSQL deve estar saudável para testes de integração e E2E. Em instalação
limpa, o Prisma Client e as migrations precisam ser preparados antes do gate:

```bash
docker compose up -d postgres
pnpm --filter @axes/api prisma:generate
pnpm --filter @axes/api prisma:migrate:deploy
```

Para o E2E autenticado, as variáveis `BOOTSTRAP_*`, `JWT_ACCESS_SECRET` e
`REFRESH_TOKEN_PEPPER` devem estar definidas no ambiente de teste.

## Inicialização

O CI parte de um PostgreSQL vazio, aplica as migrations versionadas, executa a
suíte automatizada e somente depois cria o administrador usado pelo Playwright.
Isso evita que os testes dependam de banco pré-preenchido.

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

Uma falha em qualquer etapa impede checkpoint de release, tag e merge.

O gate final deve ser executado novamente no SHA que contém também a
documentação final do ciclo. Um gate verde em um SHA anterior não substitui a
validação do candidato de release.

## Arquitetura

Os testes seguem os limites dos pacotes. Contratos, Web e API são verificáveis
separadamente; testes de integração exercitam PostgreSQL real e os E2E cobrem a
jornada do usuário pelo navegador.

Os testes multiempresa devem preferir cenários com duas organizações reais e
tentar explicitamente cruzar seus identificadores. Não é suficiente verificar
apenas o caminho positivo da organização ativa.

## Retorno

Falha no gate impede o checkpoint do ciclo. Enquanto o Cycle 2 não estiver
aprovado, o último checkpoint de rollback permanece `v0.1.0-identity-access`.

## Changelog

Mudanças de cobertura, regressões e novos controles de segurança devem ser
registradas junto ao ciclo correspondente em `CHANGELOG.md` e no PR de
validação.
