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

## Continuidade da mesma PR — novas funções sem testes

- **Oportunidades (visão de lista):** filtro local por cliente vinculado a empresa/contato, por previsão de fechamento (atrasada, neste mês, sem previsão) e ordenação (atualizadas recentemente, título A-Z, fechamento mais próximo). A visão Kanban permanece com o comportamento anterior.
- **Limpeza rápida:** botão `Limpar filtros` nas listas de contatos, empresas, atividades e oportunidades; restaura os filtros e a ordenação inicial daquela tela.
- Os novos controles utilizam estilos responsivos e são desabilitados quando já não existe filtro ou ordenação diferente do padrão.
- A busca de oportunidades existente continua consultando o servidor e seus parâmetros permanecem iguais; os novos filtros são restritos aos resultados já carregados (`limit=20`).
- **Não foram acrescentados nem executados testes manualmente**, e nenhuma checagem de build, lint ou typecheck foi iniciada como parte desta continuidade. Esta é uma entrega **não validada** para revisão em PR draft.
- A `main` pode avançar independentemente; antes de eventual integração, reconciliar a base, verificar conflitos, validar segurança e executar os gates exigidos. Não há autorização de deploy nem GO operacional.

## Reconciliação com a main — 27/10/2026

As funcionalidades originais deste candidato foram incorporadas na main pelo [PR #310](https://github.com/jeffaxe81/crm-vendas/pull/310), na consolidação de filtros e exportações. A branch do PR #307 foi atualizada com `main@d105e80868b8ed73224ff699376937cb530786f6` para eliminar conflitos.

A revisão comparou as listas de contatos, empresas, atividades e oportunidades, além dos estilos. Foram preservados os filtros, ordenação e limpeza rápida já publicados, as exportações VCF/CSV/ICS, as traduções e as proteções de permissão presentes na main. O código antigo não substitui a implementação consolidada.

O diff restante do PR #307 é apenas este registro documental; não há alteração de comportamento, migração ou deploy. As restrições de draft e de ausência de validação descritas acima registram a etapa histórica de 25/10, não a situação após reconciliação. A aptidão para merge depende da CI no novo SHA da branch.
