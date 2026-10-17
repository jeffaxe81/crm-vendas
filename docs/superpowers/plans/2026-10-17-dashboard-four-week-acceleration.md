# Dashboard do CRM — antecipação de quatro semanas

Data de referência: 17/10/2026. PR empilhada sobre a #245.

A antecipação reúne quatro frentes de trabalho planejadas em um único
incremento revisável. Não significa quatro semanas decorridas nem
liberação para produção.

## Escopo antecipado

- Semana 1: contratos tipados Zod para catálogo e volume, com rejeição
  de respostas malformadas.
- Semana 2: painel de Volume de dados na área de relatórios, com quatro
  indicadores, atualização manual e estados de carregamento/erro/vazio.
- Semana 3: isolamento visual ao trocar tenant ou token, requisições
  `no-store` e respostas HTTP sem cache.
- Semana 4: testes de interface, regressão multi-tenant e checklist de
  homologação operacional.

## Critérios de segurança

- Apenas a sessão humana com `reports.read` pode usar a API.
- API keys e superusuários globais permanecem bloqueados por padrão.
- A organização vem exclusivamente da sessão autenticada.
- O catálogo só permite as quatro métricas predefinidas.
- Alertas de 800 e 1.000 registros são indicativos, não cotas.
- Nenhuma informação individual, SQL dinâmico ou exportação foi incluída.
- Erro de atualização não mantém o último resultado como atualizado.
- Nenhuma alteração em backup, expurgo ou retenção.

## Homologação pendente

- [ ] Validar Docker staging isolado, não produção.
- [ ] Confirmar papel PostgreSQL restrito e isolamento de três tenants.
- [ ] Exercitar desktop, mobile, teclado e mensagens de falha.
- [ ] Alternar organizações sem exibir resultados de tenant anterior.
- [ ] Confirmar `Cache-Control: private, no-store` também no proxy.
- [ ] Verificar alertas sem bloqueio de criação de registros.
- [ ] Conferir fluxos de backup, expurgo e retenção inalterados.
- [ ] Registrar aprovação de QA, segurança, jurídico e Gate 0.

## Liberação

Esta PR depende de #245 e deve permanecer draft. CI aprovada não
substitui homologação real nem autorização de segurança e retenção.
