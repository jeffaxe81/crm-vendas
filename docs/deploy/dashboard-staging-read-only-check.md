# Dashboard: homologação de leitura em staging

A PR #248 introduz o verificador **somente GET** em
`scripts/dashboard-staging-smoke.mjs`. Ele não cria, altera, exporta nem
elimina dados. O script não substitui testes manuais de Docker e segurança.

## Preparação

1. Utilize **staging isolado** com HTTPS válido (ou localhost HTTP). O marcador
   `NON_PRODUCTION` é uma confirmação do operador, **não prova técnica** de que
   o endereço não seja produção. Confira DNS, rede e inventário de ambientes.
2. Disponibilize três tenants sintéticos A, B e C e três sessões **normais**,
   distintas, com permissão `reports.read`. Não use superusuário ou API key.
3. Em cada tenant, prepare contagens conhecidas e **diferentes** de empresas,
   contatos, oportunidades e atividades ativos. Confira previamente os números.
4. Configure variáveis de ambiente **fora do repositório e dos logs**:

```bash
export DASHBOARD_STAGING_ACK=NON_PRODUCTION
export DASHBOARD_STAGING_BASE_URL=https://staging.example.test/api/v1
export DASHBOARD_STAGING_TENANTS_JSON='[
  {"label":"A","token":"<SESSION_A>","expectedCounts":{"companies":1,"contacts":1,"opportunities":0,"activities":0}},
  {"label":"B","token":"<SESSION_B>","expectedCounts":{"companies":2,"contacts":1,"opportunities":1,"activities":0}},
  {"label":"C","token":"<SESSION_C>","expectedCounts":{"companies":3,"contacts":2,"opportunities":1,"activities":2}}
]'
node scripts/dashboard-staging-smoke.mjs
```

Substitua os valores de exemplo pelos dados sintéticos reais. O comando usa
credenciais efêmeras recebidas por variáveis de ambiente: nunca registre tokens
na documentação, commits, screenshots, logs ou artefatos CI. Evite `set -x`.
Encerre/revogue as três sessões após concluir. Não desative a validação TLS.

## Evidências verificadas automaticamente

- Catálogo fechado de quatro métricas e permissão `reports.read`.
- Resposta de contagem com `Cache-Control: private, no-store`.
- Contagens esperadas por tenant, sem mistura entre A, B e C.
- Releitura de A após B/C para detectar contexto residual.
- Sem autenticação: HTTP 401; query `organizationId`: HTTP 400.
- Nenhuma operação de escrita; nenhum token ou corpo HTTP nos diagnósticos.

## Controles adicionais de aceite (manuais)

- [ ] Confirmar papel PostgreSQL sem `BYPASSRLS`, com testes RLS no CI.
- [ ] Registrar 3 tenants, os dados sintéticos e as contagens, sem identificadores
      reais ou credenciais.
- [ ] Conferir o cabeçalho `no-store` também no proxy/ingress.
- [ ] Testar Android/iOS browser e desktop, teclado e sessões trocadas.
- [ ] Verificar 403 para API keys e superusuário até aprovação de break-glass.
- [ ] Comprovar que backup, expurgo e retenção não mudaram.
- [ ] Obter validação de segurança e política legal de retenção.
- [ ] Registrar responsável, ambiente, versão/commit, data e resultado.

**Não realizar merge ou deploy em produção apenas com resultado verde do script.**
