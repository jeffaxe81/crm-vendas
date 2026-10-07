# C4 — Auditoria funcional das cotas de território

## Problema encontrado

A modelagem original usava a chave `territory + period + year`. Assim, para o mesmo território e ano:

- janeiro e fevereiro eram o mesmo registro `MONTH`;
- 1º e 2º trimestre eram o mesmo registro `QUARTER`;
- salvar uma segunda cota mensal ou trimestral sobrescrevia a anterior.

A interface também não permitia informar o valor realizado, embora a métrica de atingimento dependesse desse dado.

## Correção

A cota passa a ter `periodIndex`:

- `MONTH`: 1 a 12;
- `QUARTER`: 1 a 4;
- `YEAR`: 0.

A unicidade passa a ser `territory + period + year + periodIndex`.

Registros antigos recebem `periodIndex = 0`. Para mensal/trimestral isso significa **registro legado sem subdivisão conhecida**; nenhuma data histórica é inventada.

## Métrica de atingimento

Para evitar dupla contagem quando existem cotas de granularidades diferentes no mesmo ano, a métrica usa:

1. o ano mais recente com cota;
2. a granularidade mais específica disponível nesse ano: mensal, depois trimestral, depois anual.

Assim uma cota anual não é somada novamente quando já existem cotas mensais no mesmo ano.

## Interface

- seleção explícita do mês ou trimestre;
- valor de Meta;
- valor Realizado;
- identificação legível do período na tabela;
- indicação do escopo usado pela métrica.

## Cobertura

- contratos rejeitam mensal sem mês, trimestre fora de 1–4 e subdivisão em cota anual;
- integração comprova janeiro e fevereiro simultâneos;
- atualização de janeiro não sobrescreve fevereiro;
- consulta por `periodIndex`;
- métrica evita soma duplicada com cota anual;
- teste Web comprova envio de mês e realizado.

## Compatibilidade das métricas legadas

No ano e granularidade selecionados, cotas sem subdivisão conhecida (índice 0) são usadas apenas enquanto não existem cotas com mês/trimestre explícito. Ao cadastrar períodos explícitos, somente esses valores entram na métrica; os registros legados permanecem preservados para consulta. Cotas anuais continuam usando índice 0.
