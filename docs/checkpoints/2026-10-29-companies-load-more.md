# Carregamento incremental de empresas

## Objetivo e escolha de implementação

A tela consultava exclusivamente `/companies?page=1&limit=20`, impedindo alcançar registros posteriores. Esta entrega acrescenta “Carregar mais empresas” e reutiliza a paginação autenticada existente da API, em lotes de 20. A escolha de implementação foi manter os registros anteriores na tela, em vez de substituir a lista por uma paginação numerada, para preservar o contexto dos filtros e da exportação local. Não há alteração de schema ou endpoint.

## Comportamento

- Próxima página autenticada com estado de carregamento e bloqueio de consultas simultâneas pelo botão.
- Mesclagem por ID para evitar cartões duplicados quando páginas se sobrepõem.
- Filtros e ordenação continuam aplicados somente às empresas carregadas; o CSV continua exportando apenas as empresas visíveis.
- Uma falha mantém a lista carregada e permite repetir a mesma página.
- A troca de token reinicia o carregamento; respostas atrasadas de páginas anteriores são ignoradas.
- Criação atualiza o total conhecido; confirmação de importação reinicia a lista na primeira página.
- Botão disponível também para sessão sem permissão de escrita. As ações de criação/importação continuam restritas por `canWrite` e pela API.
- Textos adicionais traduzidos para PT-BR, EN e ES.

## Validação e limites

Dois testes novos falharam inicialmente por ausência do botão. O primeiro cenário também exigiu limpeza explícita do DOM entre testes antes de verificar o comportamento. Após implementação, os nove testes de empresas/importação passaram e a verificação de tipos passou. A proteção de sessão usa uma resposta pendente resolvida depois da chegada da nova lista, com atualização React aguardada antes da asserção.

A primeira execução completa da suíte web teve 20 falhas em três arquivos de dashboards/inventário porque o `dist` compartilhado de `@axes/contracts` estava desatualizado (schemas indefinidos). Os contratos foram recompilados a partir da fonte atual, sem alterar código versionado dessas telas; a suíte completa foi então repetida e passou com 681 testes em 84 arquivos. A revisão independente encontrou uma corrida entre confirmação de importação antiga e carregamento da sessão nova. Um quarto teste reproduziu a falha antes da correção; a confirmação, seu refresh e sua finalização agora respeitam a geração da sessão, e a troca de token limpa o estado da importação. Os dez testes direcionados passaram e a segunda revisão não encontrou P1/P2. A suíte web repetida após esse último ajuste passou com **682 testes em 84 arquivos**. A CI deve ser conferida no candidato final do PR. Não foram executadas chamadas na base implantada nem homologação de produção. Paginação por offset não fornece snapshot estável diante de alterações concorrentes feitas por outros usuários; essa entrega evita duplicatas, mas não altera o contrato existente da API.

Sugestões menores de cobertura ficaram para depois: exportação/ordenação após carregar páginas adicionais, totais após criação/importação e tentativa após resposta HTTP de erro (o caso de falha de transporte está coberto).
