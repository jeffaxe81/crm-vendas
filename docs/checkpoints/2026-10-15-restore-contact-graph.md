# Restauração interna de empresas e contatos — PR #213

## Escopo implementado

Continuidade da etapa 4 do plano de backup e da issue #86: o executor interno
substitui `Company`, `Contact`, `ContactChannel`, `CompanyContact` e
`RelationshipEntry` dentro da transação de manutenção com RLS. Prepara os
cinco conjuntos antes de excluir, revalida referências e identidades atuais,
exclui dependências antes dos pais e insere na ordem inversa. Uma falha de
constraint reverte todas as alterações.

Os valores são enviados como JSON parametrizado e os identificadores vêm
somente das políticas e metadados revisados. A conversão direta no PostgreSQL
preserva os seis dígitos de microssegundos; enums usam seus nomes de banco.
Um conjunto ausente nunca é interpretado como pedido de exclusão. Modelos
`REPLACE` ainda não suportados, com registros no backup **ou no banco atual**,
impedem o início da substituição.

## Verificação

- [CI RED 38802393047](https://github.com/jeffaxe81/crm-vendas/actions/runs/38802393047),
  head `d1688eff43a01c43fe6e20db62abb1c86af9514a`: 12 regressões reproduzidas
  antes da implementação, incluindo oito em PostgreSQL com papel restrito e
  quatro de conjuntos incompletos. Houve perda de microssegundos comprovada
  também no caminho anterior de restauração somente de empresas.
- Local: quatro regressões de conjuntos incompletos passaram de RED a GREEN;
  21 testes direcionados aprovados, API sem erros de tipos após gerar Prisma,
  formatação, foundation e preflight `CODE_CHECKS_PASSED` aprovados.
- Testes locais de repositório: 65/66; somente o contrato da topologia Compose
  não executou porque o binário Docker está ausente. O pipeline completo da
  PR deve confirmar PostgreSQL, todos os testes, build e imagens antes de merge;
  os resultados finais e SHAs são registrados na PR. Após merge, conferir
  separadamente o CI e manifesto do SHA da main.
- Revisão técnica por outro agente, estática: nenhum achado Critical/Important.
  Melhoria menor adiada: acrescentar um caso que injete um ID de contato
  existente de outra organização. Há teste de organização manipulada, alvo
  referencial ausente e preservação de outra organização; a checagem atual
  de fechamento do snapshot também rejeita um ID externo existente.

## Limites

É uma função interna sem rota, botão ou operação pública de restauração.
Não substitui usuários, senhas, associações, privilégios, sessões, credenciais,
auditoria nem a configuração da raiz `Organization`. Demais modelos, políticas
especiais, cópia preventiva verificada, confirmação, auditoria de sucesso e
revogação de sessões continuam pendentes de integração no restaurador completo.
Não houve teste nem alteração de dados reais no servidor. A homologação
operacional permanece pendente na issue #159.
