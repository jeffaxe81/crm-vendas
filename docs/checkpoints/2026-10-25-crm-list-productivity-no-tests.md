# CRM — produtividade nas listas (candidato não testado)

Data: 2026-10-25. Base da branch: `main@7310e045e21dbfa49ef87d37fc7a1db0add7d017`.

## Escopo implementado

- **Contatos:** pesquisa local por nome, cargo e valores/rótulos de canais; filtro com/sem canal; ordenação por nome ascendente/descendente ou atualização mais recente; indicador de quantidade visível e lista vazia ao aplicar filtros.
- **Empresas:** pesquisa inclui documento e website além de razão social/nome fantasia; filtro de cadastros com/sem nome fantasia; ordenação local por razão social ou atualização; indicador de quantidade visível.
- **Atividades:** filtros rápidos locais de prioridade e prazo (todas, atrasadas, vencem hoje, sem prazo); contador de registros exibidos e mensagem adequada quando não há correspondência.
- **Estilos:** campos de filtro responsivos para desktop e celular.

## Limites e segurança

- Os filtros são **somente locais** e operam sobre os itens carregados pela API; as chamadas existentes usam paginação (em geral 20 por página). Não são busca global, relatórios completos nem alteração de consultas no servidor.
- Nenhum endpoint novo, mutação de dados, migração, permissão, RLS ou controle de autenticação foi modificado.
- Foram alterados exclusivamente componentes Web, a folha de estilos e este checkpoint.
- **Pedido expresso:** avançar sem adicionar ou executar testes neste ciclo. Esta entrega não foi validada por testes manuais ou automatizados durante a implementação e não tem evidência de homologação.
- Manter PR como **draft**, sem merge na `main`, deploy ou GO, até validações e autorização específicas em etapa posterior.
