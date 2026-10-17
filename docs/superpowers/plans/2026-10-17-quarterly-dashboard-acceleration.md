# Antecipação trimestral — Dashboard CRM Axesistemas

Data: 17/10/2026. Horizonte de planejamento: 12 semanas, de
19/10/2026 a 10/01/2027. **Não equivale à execução literal de três meses**.
A PR é uma antecipação técnica dos marcos possíveis neste ciclo; tarefas
com dependências externas permanecem identificadas como pendentes.

## Dependências e governança

- PR #245: API restrita por tenant e proteção PostgreSQL RLS.
- PR #248: painel base, teste sintético de três tenants e CI Docker.
- Esta PR: indicadores comparativos efêmeros, CSV agregado e verificações de
  acesso privilegiado sob credenciais de teste.
- Ambas as PRs dependentes e esta PR permanecem em draft até aceite Gate 0.
- A `main` pode avançar: repetir CI ao incorporar commits de restore/backup.

## 12 semanas — organização em três marcos

| Semana | Resultado verificável                                            | Estado                |
| ------ | ---------------------------------------------------------------- | --------------------- |
| 1      | API de catálogo restrito, autenticação e RLS                     | Implementado em #245  |
| 2      | Testes de isolamento e contagens de três tenants                 | Implementado em #245  |
| 3      | Interface de volume, erro/vazio e atualização manual             | Implementado em #248  |
| 4      | Tradução, cache desabilitado e build de imagens                  | Implementado em #248  |
| 5      | Comparação de snapshots consecutivos na sessão                   | Implementado nesta PR |
| 6      | Limpar comparação em troca de token/erro                         | Implementado nesta PR |
| 7      | Exportação local CSV com agregados apenas                        | Implementado nesta PR |
| 8      | Testes de exportação e consistência sem PII                      | Implementado nesta PR |
| 9      | Verificação de 403 para API key e superuser no staging sintético | Implementado nesta PR |
| 10     | Runbook de homologação e critérios de aceite                     | Documentado           |
| 11     | Ensaios de performance e layout em Docker real                   | Pendente de ambiente  |
| 12     | Sign-off QA/segurança, retenção e Gate 0                         | Pendente de aprovação |

## Contratos de comportamento

- **Comparação:** ocorre somente quando o usuário atualiza e recebe duas
  respostas válidas cronologicamente, sem armazenamento histórico no servidor
  ou no navegador. Falhas de consulta não expõem dados defasados.
- **CSV:** contém exclusivamente cinco contagens agregadas e horário UTC:
  empresas, contatos, oportunidades, atividades e total. Sem IDs/tokens,
  linhas de CRM, campos personalizáveis ou fórmulas. O arquivo é produzido
  localmente e não publicado para a API ou terceiros.
- **Staging:** verifica 3 tenants distintos com fixtures conhecidas; a prova
  403 para API key e superuser é opcional e somente acontece quando as duas
  credenciais de teste forem entregues ao procedimento.
- **Alertas:** 800/1000 são marcadores informativos, não cotas, preço ou
  retenção/expurgo automático.

## Barreiras para produção

- [ ] Execução do smoke em servidor Docker **staging** isolado e registrado
- [ ] Validação de tráfego HTTPS e `private, no-store` através do proxy
- [ ] Performance com 100/1.000/10.000 registros ativos por tenant sintético
- [ ] Teclado, leitor de tela, resolução reduzida e idiomas PT/EN/ES
- [ ] Teste negativo de sessão expirada e troca simultânea de organizações
- [ ] Política de retenção, backup/restore e expurgo aprovadas formalmente
- [ ] Definição de break-glass, MFA e segundo aprovador
- [ ] QA e segurança aprovam evidências e rollback

Não mesclar com `main`, não habilitar controles administrativos privilegiados
e não implantar em produção com base apenas na CI.
