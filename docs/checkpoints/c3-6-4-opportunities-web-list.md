# Checkpoint — C3.6.4 Opportunities Web / Lista

## Estado da entrega

- branch canônica: `feat/c3-6-4-opportunities-web-list`;
- PR: #31;
- base: `main` em `9c0ec9e21ba5ecf111d96c2a98af1f97543e8a7b`;
- decisão de produto preservada: Opção A — lista de oportunidades;
- PR permanece Draft e o merge permanece bloqueado até gate integral GREEN no SHA documental definitivo e aprovação humana explícita específica para o PR #31.

## Escopo desta microentrega

A C3.6.4 entrega a primeira fatia Web de Oportunidades sobre a API já integrada ao `main`:

- seção `Oportunidades` no App Shell;
- navegação exposta somente quando a sessão contém `opportunity.read`;
- lista read-only consumindo `GET /api/v1/opportunities`;
- busca textual por `q`;
- ordenação inicial por `updatedAt desc`;
- estados de carregamento, erro e vazio;
- visualização do título, valor estimado e previsão de fechamento.

## Segurança e contratos

- nenhuma nova permissão RBAC foi criada;
- a UI apenas oculta/exibe a navegação com base em `opportunity.read`; a API continua sendo a autoridade de autorização;
- nenhuma operação de escrita de Opportunity foi adicionada nesta fatia;
- isolamento multiempresa, RLS e contexto tenant-aware permanecem implementados e validados no backend já integrado;
- o gate continua provisionando o role PostgreSQL de aplicação com `NOBYPASSRLS` antes dos testes.

## Evidência TDD

### RED — navegação e lista

- commit RED: `92fc8f741256554ad5d3dabedb8e9f1da3933940`;
- workflow RED: `34551827072` (#563);
- infraestrutura, migrations, role RLS, Prettier, lint, typecheck, contratos e regressão anterior passaram;
- a suíte Web terminou com 28 testes passando e uma única falha nova;
- falha esperada: ausência do botão acessível `Oportunidades` no App Shell.

### Implementação GREEN candidata

A implementação funcional foi introduzida nos commits:

- `62f6cb2790e3a2ac674937022e94726ac60bba7a` — lista read-only de oportunidades;
- `db4605a920383bdfc847040e0ebefd76f6f5e24e` — navegação autorizada;
- `39e121b7448d590eadb529c4800251e7dac83794` — integração no `Home`.

Os workflows #566 e #568 não são classificados como falha funcional: ambos pararam no `prettier --check` antes dos testes. A formatação exata foi então aplicada pelo próprio ambiente travado do repositório com `pnpm exec prettier --write`; o workflow temporário se auto-removeu após produzir o commit de estilo.

O workflow GREEN definitivo será registrado no body do PR #31 após a execução integral no SHA documental final, evitando autorreferência impossível dentro deste próprio commit.

## Fora do escopo

Permanecem deliberadamente fora da C3.6.4:

- criação e edição de oportunidades;
- tela de detalhe completa;
- movimentação entre etapas pela Web;
- fechamento WON/LOST;
- Kanban e drag-and-drop;
- timeline unificada;
- automações, alertas e IA.

## Gate de integração

Após esta documentação, um workflow completo deve terminar GREEN no SHA documental definitivo, incluindo:

- instalação congelada e políticas de supply chain;
- Prisma generate;
- deploy de migrations;
- provisionamento do role de aplicação sem bypass de RLS;
- `pnpm verify`;
- bootstrap do administrador E2E;
- Playwright E2E;
- validação de Compose;
- build das imagens API e Web.

Mesmo após GREEN e com o PR mergeável, o PR #31 deve permanecer Draft e **não pode ser marcado ready nem mergeado** sem aprovação humana explícita equivalente a:

`Aprovo o merge do PR #31 na main.`
