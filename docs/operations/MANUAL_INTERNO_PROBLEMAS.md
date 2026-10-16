# Manual interno de problemas — CRM-Vendas

Atualização: 16/10/2026. Repositório: jeffaxe81/crm-vendas.

## Alcance e estado

Registro central dos incidentes relatados pelo responsável, problemas descritos nos documentos do projeto e correções identificáveis no histórico Git. Não havia manual central localizado na revisão; este documento consolida os registros existentes, sem substituí-los. A cobertura histórica é limitada às evidências disponíveis: ausência de registro não comprova ausência de problema.

“Integrada no código” não significa implantada ou homologada no servidor. Situações sem evidência de encerramento permanecem pendentes. A [homologação operacional](HOMOLOGACAO_OPERACIONAL_CRM.md) continua com seu próprio aceite. Este trabalho é documental; nenhum teste, deploy ou alteração de dados foi executado para produzi-lo.

## Índice de problemas

| ID       | Problema                                                                          | Estado                                                                                                |
| -------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| CRM-P001 | [CORS bloqueia localhost/127.0.0.1](#crm-p001)                                    | Correção proposta na PR #219; implantação e homologação pendentes.                                    |
| CRM-P002 | [ZodError após colocar uma lista em WEB_ORIGIN](#crm-p002)                        | Erro observado; campo exato do ZodError não foi apresentado integralmente.                            |
| CRM-P003 | [Failed to fetch com API saudável e URL pública incorreta](#crm-p003)             | Ocorrências documentadas; confirmação final no navegador pendente.                                    |
| CRM-P004 | [Diagnóstico usa rota de saúde incorreta ou roda durante startup](#crm-p004)      | Limitação do diagnóstico identificada.                                                                |
| CRM-P005 | [Permissão negada ao ler .env](#crm-p005)                                         | Execução com sudo comprovada; leitura sem sudo não confirmada.                                        |
| CRM-P006 | [APP_DB_PASSWORD ausente na interpolação do Compose](#crm-p006)                   | Erro de configuração observado; encerramento não comprovado neste registro.                           |
| CRM-P007 | [Bootstrap de administrador bloqueado pelo RLS da auditoria](#crm-p007)           | Correção integrada no código; execução no servidor a confirmar.                                       |
| CRM-P008 | [502 no Nginx por senha divergente da role axes_app](#crm-p008)                   | Correção de deploy integrada; homologação operacional permanece separada.                             |
| CRM-P009 | [Ambiguidade de Compose e possíveis finais CRLF](#crm-p009)                       | Ambiguidade tratada no repositório; CRLF era agravante possível.                                      |
| CRM-P010 | [Downloads npm lentos durante build Docker](#crm-p010)                            | Lentidão observada; causa de rede não encerrada.                                                      |
| CRM-P011 | [Mesmo e-mail impedido em outra empresa](#crm-p011)                               | Correção integrada na main pela PR #216.                                                              |
| CRM-P012 | [Backup sem operação ou arquivo visível](#crm-p012)                               | Em investigação no ambiente do responsável.                                                           |
| CRM-P013 | [Recuperação de backups interrompidos e workers obsoletos](#crm-p013)             | Correções integradas na main; validação do servidor pendente.                                         |
| CRM-P014 | [Restauração incompleta e perda de microssegundos](#crm-p014)                     | Correção interna integrada na PR #213; restauração integral pública não entregue por esse incremento. |
| CRM-P015 | [Exclusão de backup com proteção desatualizada, polling e UUID](#crm-p015)        | Correções integradas na main pela PR #214.                                                            |
| CRM-P016 | [Diagnósticos de deploy com falsos positivos](#crm-p016)                          | Correções presentes no histórico; não substituem aceite real.                                         |
| CRM-P017 | [Ambiente de desenvolvimento sem pré-requisitos para testes integrais](#crm-p017) | Limitação registrada; nenhuma nova execução autorizada agora.                                         |
| CRM-P018 | [Outras regressões e correções técnicas ao longo do projeto](#crm-p018)           | Inventariadas por commit; validação operacional não presumida.                                        |

<a id="crm-p001"></a>

## CRM-P001 — CORS bloqueia localhost/127.0.0.1

- **Data:** 16/10/2026.
- **Estado:** Correção proposta na PR #219; implantação e homologação pendentes.
- **Sintoma:** Navegador retorna NetworkError when attempting to fetch resource ou Failed to fetch ao acessar o front por outra origem.
- **Causa/evidência:** WEB_ORIGIN representa uma URL única e era a única origem liberada no enableCors. localhost e 127.0.0.1 são origens distintas.
- **Tratamento e prevenção:** PR #219 adiciona CORS_ORIGINS opcional, separada por vírgulas, trim e remoção de vazios, com fallback para WEB_ORIGIN. Em dev: `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`; em produção: URL exata do front. WEB_ORIGIN continua URL única para links de avaliação. A variável precisa ser fornecida ao processo da API; o PR não altera Compose nem .env.
- **Referências:** [PR #219](https://github.com/jeffaxe81/crm-vendas/pull/219), commit 7a72c112e202522860d11a65663999044ee24364.

<a id="crm-p002"></a>

## CRM-P002 — ZodError após colocar uma lista em WEB_ORIGIN

- **Data:** 16/10/2026.
- **Estado:** Erro observado; campo exato do ZodError não foi apresentado integralmente.
- **Sintoma:** Após executar sudo ./teste3, API em starting, conexões HTTP sem resposta e log com ZodError.
- **Causa/evidência:** O script colocou uma lista em WEB_ORIGIN, incompatível com seu contrato de URL única. O trecho resumido do log não permite atribuir todos os erros de inicialização exclusivamente a esse campo.
- **Tratamento e prevenção:** Manter WEB_ORIGIN como URL única; após integrar P001, usar CORS_ORIGINS para a lista. Preservar o log completo com o caminho do campo rejeitado antes de considerar o incidente encerrado.
- **Referências:** Saída fornecida pelo responsável em 16/10/2026, itens 3, 4, 6 e 9.

<a id="crm-p003"></a>

## CRM-P003 — Failed to fetch com API saudável e URL pública incorreta

- **Data:** 30/09 e 14/10/2026.
- **Estado:** Ocorrências documentadas; confirmação final no navegador pendente.
- **Sintoma:** API responde 200, mas cadastro falha; Network mostra register com net::ERR_CONNECTION_REFUSED.
- **Causa/evidência:** Foi documentado NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1 no bundle. No navegador de outro computador, localhost aponta para esse computador; HTTPS com API HTTP também pode produzir conteúdo misto. CORS e conectividade são causas diferentes.
- **Tratamento e prevenção:** Configurar a URL alcançável pelo navegador. No proxy HTTPS usar a mesma origem e /api/v1. Reconstruir o web, pois NEXT_PUBLIC_* é embutida no build; alterar apenas o ambiente do container não garante atualização do bundle. Conferir URL exata na aba Network.
- **Referências:** [Deploy HTTPS](../deploy/deploy-https.md), [troca de endereço](../deploy/configurar-endereco.md); relatos de 30/09 e 14/10.

<a id="crm-p004"></a>

## CRM-P004 — Diagnóstico usa rota de saúde incorreta ou roda durante startup

- **Data:** 16/10/2026.
- **Estado:** Limitação do diagnóstico identificada.
- **Sintoma:** Script testa /, /health e /api/health e reporta FAIL enquanto health=starting.
- **Causa/evidência:** A rota indicada pelo Compose é /api/v1/health. Porta TCP aberta não comprova readiness HTTP; starting ainda não é healthy.
- **Tratamento e prevenção:** Usar /api/v1/health e registrar estado e logs. Falta de resposta não comprova falha de CORS. Aguardar o healthcheck com prazo antes de concluir indisponibilidade definitiva.
- **Referências:** Saída do teste3 fornecida pelo responsável; compose.yaml.

<a id="crm-p005"></a>

## CRM-P005 — Permissão negada ao ler .env

- **Data:** 15–16/10/2026.
- **Estado:** Execução com sudo comprovada; leitura sem sudo não confirmada.
- **Sintoma:** docker compose informa open /desenv/crm-vendas/.env: permission denied.
- **Causa/evidência:** Arquivo informado como root:docker com modo 640; o acesso depende da identidade e dos grupos efetivos do processo.
- **Tratamento e prevenção:** Executar a operação administrativa autorizada com sudo e preservar as permissões privadas. Se necessário, revisar proprietário/grupo e associação efetiva; não tornar .env público nem registrar seu conteúdo no manual.
- **Referências:** Relato de 15/10 e saída sudo ./teste3 de 16/10.

<a id="crm-p006"></a>

## CRM-P006 — APP_DB_PASSWORD ausente na interpolação do Compose

- **Data:** 13/10/2026.
- **Estado:** Erro de configuração observado; encerramento não comprovado neste registro.
- **Sintoma:** Compose aborta: required variable APP_DB_PASSWORD is missing a value.
- **Causa/evidência:** Variável obrigatória não estava disponível para a interpolação.
- **Tratamento e prevenção:** Preencher a configuração privada da instalação, conferir caminho e permissão do .env e preservar credenciais/volume existentes. Não imprimir o Compose expandido com segredos.
- **Referências:** Relato de instalação de 13/10; [deploy](../deploy/deploy-https.md).

<a id="crm-p007"></a>

## CRM-P007 — Bootstrap de administrador bloqueado pelo RLS da auditoria

- **Data:** 13/10/2026.
- **Estado:** Correção integrada no código; execução no servidor a confirmar.
- **Sintoma:** bootstrap-admin.ts falha em prisma.auditLog.create com código 42501: new row violates row-level security policy for table audit_logs.
- **Causa/evidência:** Auditoria do bootstrap não respeitava o contexto tenant exigido pelo RLS.
- **Tratamento e prevenção:** Correção de auditoria no contexto da organização na PR #196. Manter a role restrita e o RLS; não resolver usando BYPASSRLS ou removendo políticas.
- **Referências:** Commit dcf91aa, PR #196, relato completo do bootstrap de 13/10.

<a id="crm-p008"></a>

## CRM-P008 — 502 no Nginx por senha divergente da role axes_app

- **Data:** 09/10/2026.
- **Estado:** Correção de deploy integrada; homologação operacional permanece separada.
- **Sintoma:** HTTPS 502, web não inicia, API unhealthy e health 503 com password authentication failed for user axes_app.
- **Causa/evidência:** A role era criada só no primeiro volume; mudar APP_DB_PASSWORD posteriormente não atualizava a senha no banco. web dependia da API healthy.
- **Tratamento e prevenção:** Deploy introduziu db-bootstrap idempotente para sincronizar role, senha e permissões, além de logs de readiness. Preservar o volume. Não usar down -v para corrigir autenticação.
- **Referências:** [Incidente e tratamento](../deploy/deploy-https.md), commit 373a801 / PR #107.

<a id="crm-p009"></a>

## CRM-P009 — Ambiguidade de Compose e possíveis finais CRLF

- **Data:** 09/10/2026.
- **Estado:** Ambiguidade tratada no repositório; CRLF era agravante possível.
- **Sintoma:** Aviso sobre múltiplos arquivos Compose; configuração podia divergir da stack esperada.
- **Causa/evidência:** Coexistiam docker-compose.yml legado FastAPI e compose.yaml principal. CRLF no .env foi citado como possibilidade, não confirmado para todas as instalações.
- **Tratamento e prevenção:** Stack legada renomeada para docker-compose.fastapi.yml; usar a stack TypeScript principal e arquivos LF. Não substituir globalmente URLs nem credenciais.
- **Referências:** [Deploy HTTPS](../deploy/deploy-https.md).

<a id="crm-p010"></a>

## CRM-P010 — Downloads npm lentos durante build Docker

- **Data:** 15/10/2026.
- **Estado:** Lentidão observada; causa de rede não encerrada.
- **Sintoma:** WARN Request took ... em pacotes Next, Prisma e elkjs durante build.
- **Causa/evidência:** Logs comprovam demora de download; não comprovam falta de disco, corrupção ou defeito funcional da aplicação.
- **Tratamento e prevenção:** Registrar duração, acesso ao registry e recursos. Foi utilizada construção com COMPOSE_PARALLEL_LIMIT=1. Preservar cache e dados; não atribuir automaticamente a disco cheio.
- **Referências:** Logs enviados pelo responsável em 15/10 e build compilado de 16/10.

<a id="crm-p011"></a>

## CRM-P011 — Mesmo e-mail impedido em outra empresa

- **Data:** 15/10/2026.
- **Estado:** Correção integrada na main pela PR #216.
- **Sintoma:** Cadastro ou vínculo de uma conta existente em outra empresa era bloqueado.
- **Causa/evidência:** A unicidade da identidade era confundida com exclusividade de participação em uma organização.
- **Tratamento e prevenção:** Uma identidade por e-mail normalizado pode ter vínculos independentes por organização. Com vários vínculos ativos, login exige organization.slug; permissões e sessões permanecem por empresa. Duplicidade na mesma empresa continua conflito.
- **Referências:** [Regra atual](../multi-organization-email.md), commits e4683d0 e c8a6b57 / PR #216.

<a id="crm-p012"></a>

## CRM-P012 — Backup sem operação ou arquivo visível

- **Data:** 15/10/2026.
- **Estado:** Em investigação no ambiente do responsável.
- **Sintoma:** Consulta de data_operations kind BACKUP retorna zero linhas e diretório de backups sem arquivos.
- **Causa/evidência:** A evidência comprova ausência de registros no banco consultado e arquivos no diretório consultado; não identifica se a solicitação chegou à API nem se tenant, banco ou destino eram os esperados.
- **Tratamento e prevenção:** Correlacionar requisição, usuário autorizado, tenant, auditoria, configuração privada e worker antes de afirmar que houve backup. Catálogo vazio não equivale a backup bem-sucedido.
- **Referências:** Consulta SQL e listagem fornecidas pelo responsável em 15/10; [administração](../deploy/backup-administration.md).

<a id="crm-p013"></a>

## CRM-P013 — Recuperação de backups interrompidos e workers obsoletos

- **Data:** 15/10/2026.
- **Estado:** Correções integradas na main; validação do servidor pendente.
- **Sintoma:** Falhas reproduzidas na adoção de objeto publicado após interrupção e escritas de catálogo por worker que perdeu o lease.
- **Causa/evidência:** Faltavam reconciliação segura de objetos imutáveis e proteção consistente das escritas terminais pelo lease/tentativa vigente.
- **Tratamento e prevenção:** Renovar lease, validar posse e serializar escritas; validar AES-GCM, organização, esquema e checksum antes de adotar o objeto. Falha permanente libera a fila e preserva o objeto para análise; falha de I/O não deve ser rotulada corrupção.
- **Referências:** [Checkpoint detalhado](../checkpoints/2026-10-15-backup-interrupted-recovery.md), issues #207/#86, PR #210; b6b499a / #208 trata snapshot após escritores anteriores.

<a id="crm-p014"></a>

## CRM-P014 — Restauração incompleta e perda de microssegundos

- **Data:** 15/10/2026.
- **Estado:** Correção interna integrada na PR #213; restauração integral pública não entregue por esse incremento.
- **Sintoma:** Regressões demonstraram conjunto incompleto de empresas/contatos e perda de precisão temporal.
- **Causa/evidência:** Executor anterior não cobria todo o grafo nem preservava toda a precisão nativa.
- **Tratamento e prevenção:** Preparar cinco conjuntos completos, validar referências, excluir dependências antes dos pais e inserir inversamente em transação RLS. Preservar microssegundos no PostgreSQL. Conjunto ausente nunca significa exclusão.
- **Referências:** [Checkpoint de restauração](../checkpoints/2026-10-15-restore-contact-graph.md), PR #213.

<a id="crm-p015"></a>

## CRM-P015 — Exclusão de backup com proteção desatualizada, polling e UUID

- **Data:** 15/10/2026.
- **Estado:** Correções integradas na main pela PR #214.
- **Sintoma:** Exclusão retomada podia usar proteção antiga; polling parava após falha; download/prévia rejeitavam UUID válido.
- **Causa/evidência:** Era preciso reler as proteções após a espera; expressão de IDs aceitava quatro grupos em vez dos cinco do UUID.
- **Tratamento e prevenção:** Revalidar no worker e após a trava; persistir DELETING/DELETED com auditoria e remoção idempotente, proteger cópia verificada mais recente, manter polling e aceitar UUID válido.
- **Referências:** [Checkpoint de exclusão](../checkpoints/2026-10-15-backup-protected-deletion.md), commits 8a0f65b e fc35345 / PR #214.

<a id="crm-p016"></a>

## CRM-P016 — Diagnósticos de deploy com falsos positivos

- **Data:** Outubro/2026.
- **Estado:** Correções presentes no histórico; não substituem aceite real.
- **Sintoma:** Diagnóstico podia mostrar OK apesar de erro do curl, redirecionamento ambíguo ou falha ao inspecionar bundle Docker.
- **Causa/evidência:** Verificações precisavam considerar exit status, CA, destino do redirect e falha/vazio da inspeção de bundle.
- **Tratamento e prevenção:** Falhar de forma explícita quando transporte, CA ou inspeção falharem. HTTP 200 isolado não prova HTTPS válido. Não usar curl -k como evidência de confiança TLS.
- **Referências:** Histórico de correções no [índice](HISTORICO_CORRECOES.md): ab4324d, 0944c14, f54877e, 73fac67, 2f225b9; PRs #176/#182 mencionadas nos registros históricos.

<a id="crm-p017"></a>

## CRM-P017 — Ambiente de desenvolvimento sem pré-requisitos para testes integrais

- **Data:** 16/10/2026.
- **Estado:** Limitação registrada; nenhuma nova execução autorizada agora.
- **Sintoma:** Testes de integração falham por falta de PostgreSQL/RLS_DATABASE_URL; Node disponível 24.19.0 difere do 24.20.x solicitado.
- **Causa/evidência:** Ausência de banco/role restrita no executor; cliente Prisma precisou ser gerado antes do build. Falha de infraestrutura não comprova regressão funcional nem aprovação do sistema.
- **Tratamento e prevenção:** Antes da suspensão solicitada: 66 suítes unitárias / 463 testes e build da API passaram. A suíte completa falhou; resultados não representam homologação em produção. Não repetir testes enquanto vigorar a orientação de 16/10.
- **Referências:** Execuções da correção CORS, [PR #219](https://github.com/jeffaxe81/crm-vendas/pull/219).

<a id="crm-p018"></a>

## CRM-P018 — Outras regressões e correções técnicas ao longo do projeto

- **Data:** Histórico até 16/10/2026.
- **Estado:** Inventariadas por commit; validação operacional não presumida.
- **Sintoma:** O histórico contém correções de paginação, Kanban, CSAT, relatórios por organização, concorrência do Quick Setup, webhooks, e-mail/OAuth, backup e CI.
- **Causa/evidência:** As causas detalhadas variam e devem ser consultadas no diff e na descrição de cada commit; o título sozinho não comprova incidente no servidor.
- **Tratamento e prevenção:** Consultar o índice completo de commits de correção, que preserva os títulos originais e links para evidência. Evoluir cada entrada relevante para ficha detalhada ao confirmar reprodução/impacto.
- **Referências:** [Histórico de correções](HISTORICO_CORRECOES.md), incluindo 645b050, cc72041, 0464e16, 841d160, ab45d1e e c3c452f.

## Registro de novos problemas

Todo novo problema encontrado deve ser acrescentado a este manual no mesmo PR da correção, ou em PR documental associado quando ainda estiver em investigação. Preservar o ID e o histórico; não apagar incidentes encerrados.

Registrar: ID sequencial, data, ambiente/SHA quando conhecido, sintoma e impacto, passos de reprodução já observados, evidência sem segredos, causa confirmada ou hipótese explícita, tratamento, prevenção, issue/PR/commit e estado de implantação/homologação. Não marcar como resolvido apenas por abrir PR, passar CI ou obter health 200. Só executar testes quando autorizados; proposta de validação não equivale a execução.

Para encerrar: registrar versão implantada, responsável, data e evidência do desaparecimento do sintoma no ambiente afetado. Se não disponíveis, manter “correção no código; homologação pendente”. Não incluir senhas, tokens, .env integral ou dados pessoais de clientes.
