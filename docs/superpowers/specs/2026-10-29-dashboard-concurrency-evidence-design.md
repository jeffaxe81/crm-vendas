# Dashboard Concurrency Evidence — Design

## Intent

Fechar parte reproduzível da issue #255 adicionando carga concorrente opt-in ao smoke read-only de dashboards, preservando as validações multi-tenant já existentes.

## Goals

- manter o modo sequencial atual compatível;
- permitir concorrência limitada e explícita em laboratório sintético;
- medir amostras por tenant com p50/p95/máximo sem imprimir tokens ou URL privada;
- revalidar contagens e Cache-Control em cada amostra;
- registrar metodologia e limites sem declarar SLA, capacidade ou GO.

## Non-goals

- não executar em produção;
- não semear dados reais;
- não medir ingress/TLS ou consumo de pico do servidor nesta entrega;
- não alterar consultas dos dashboards.

## Approach

Adicionar `concurrency` opcional ao bloco `performance`, default 1 e limite conservador. Para valor maior que 1, distribuir as leituras em lotes limitados e medir cada requisição com relógio monotônico. A saída informa modo e concorrência. Configurações inválidas falham antes da primeira requisição.

## Acceptance

Testes comprovam compatibilidade do modo sequencial, limite de concorrência, quantidade exata de amostras, isolamento por tenant, fail-closed para cache/contagens e ausência de segredos no relatório.
