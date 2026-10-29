# Restore Policy Coverage Gate — Design

## Intent

Impedir regressão silenciosa no restore integral (#250) quando o registro de dados por tenant ganhar novos modelos ou políticas.

## Current state

A `main` atual já suporta Role, RolePermission, Ticket, TicketEvent e os demais modelos REPLACE listados pelo issue antigo. A lacuna útil é garantir que o registro e o executor continuem sincronizados.

## Goals

- provar que todo modelo ORGANIZATION + REPLACE com dados é reconhecido pelo executor;
- manter lista explícita das políticas especiais que exigem tratamento fora do grafo;
- falhar quando um novo modelo/policy entrar no registro sem cobertura revisada;
- não executar restore real nem expor rota pública.

## Non-goals

- não alterar dados;
- não habilitar recuperação;
- não substituir homologação destrutiva em laboratório.

## Approach

Criar um gate unitário/puro de cobertura baseado em `TENANT_DATA_REGISTRY` e nas funções públicas do executor. O teste constrói contagens sintéticas para todos os REPLACE e exige zero modelos não suportados; também fixa as políticas especiais atuais em uma matriz revisada.

## Acceptance

Uma adição fictícia de modelo/política sem mapeamento deve fazer o gate falhar fechado. A suíte existente de restore deve permanecer verde.
