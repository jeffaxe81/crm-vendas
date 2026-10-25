# Cinco funcionalidades — pacote isolado do CRM

## Escopo e isolamento

Pedido: avançar cinco funcionalidades sem testar na `main`.

Todo o desenvolvimento e a validação deste pacote ocorrem no worktree `/workspace/crm-five-features`, branch `feat/five-crm-features-isolated-20261024`, criada de `origin/main` em `22400048e0c93d4b053133d46bdd8893fb15baa2`. Não integrar este pacote à `main` nem fazer deploy como parte desta entrega. O código já existente nos candidatos abaixo foi consolidado, preservando seus testes e controles.

## Funcionalidades reunidas

| Funcionalidade                        | Comportamento disponível na branch                                                                                                                      | Origem                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Revogação de sessões após restauração | Preserva os registros e o histórico; revoga sessões ainda não revogadas apenas da organização restaurada, na mesma transação.                           | PR #300, `91c576daab0beb94259ca67426f68944ea015297` |
| Restauração segura de CSAT            | Recupera respostas e metadados; gera hashes aleatórios novos; pesquisas não respondidas permanecem expiradas até gerar novo link pelo fluxo autorizado. | PR #302, `834e7cb6bb8e85a806c2c37c61c298ad23e231a5` |
| Painel de volume por organização      | Contagens ativas de empresas, contatos, oportunidades e atividades, com atualização, carregamento, erro e alertas informativos.                         | PR #301, `7348ce6fb2211b48e1548a587399a4d37c456649` |
| Comparação de volume                  | Compara duas leituras bem-sucedidas na mesma sessão do painel; descarta estado ao trocar token ou ocorrer erro. Não é uma série histórica persistente.  | PR #301                                             |
| CSV agregado                          | Exporta os totais exibidos em CSV local, sem registros individuais, IDs de organização ou tokens; inclui proteção contra fórmulas.                      | PR #301                                             |

## Controles preservados

- Dashboards exigem sessão humana e `reports.read`; API keys e superusuários continuam bloqueados.
- Organização vem da sessão, acesso ao banco usa contexto de tenant/RLS e transação consistente; API e cliente evitam cache.
- Restauração permanece interna, sem nova rota, botão ou worker público.
- `EmailOutbox` continua bloqueando restauração de dependências sem política autorizada.
- Sessões e tokens históricos não são reativados a partir do backup.
- Gates #159/#250/#255/#256 permanecem independentes; testes sintéticos não concedem GO operacional.

## Validação do pacote

- Consolidação dos três candidatos sem conflitos.
- Revisão independente do diff combinado: sem bloqueadores concretos; não executou testes.
- Checagem de tipos de API, Web e contratos: aprovada no worktree isolado.
- Formatação completa: aprovada no worktree isolado.
- `pnpm test` completo no worktree: 2.049 testes aprovados — 107 repositório, 132 contratos, 654 Web e 1.156 API (165 suítes API).
- `pnpm build`: aprovado para contratos, API e Web.
- `pnpm test:e2e`: sete jornadas aprovadas em Chromium, usando o servidor desta branch e o banco descartável. A conexão do servidor e do bootstrap usou o papel restrito; nenhuma instância existente foi reutilizada.
- A primeira tentativa de preparar E2E parou antes dos testes por caminho de cache do pnpm indisponível. Configurar os diretórios XDG/store no workspace permitiu instalar os mesmos pacotes do lockfile e executar as sete jornadas com sucesso.
- Os E2E validam regressões das jornadas existentes; os casos de restauração, API de dashboards, comparações e CSV também são exercitados pelas suítes de API/componentes/contratos acima. Não alegar que os sete E2E, isoladamente, cobrem todas as cinco funcionalidades.

Os comandos foram executados em `feat/five-crm-features-isolated-20261024`. A `main` local permaneceu em `22400048e0c93d4b053133d46bdd8893fb15baa2`; nenhum teste, push ou merge foi executado nela como parte deste pacote.

Ambiente local: Node 24.19.0/pnpm 11.25.0, com aviso de divergência das versões fixadas. PostgreSQL 18 descartável em porta local exclusiva, banco sintético e papel sem superusuário/BYPASSRLS. Nenhum dado ou serviço de produção foi usado.
