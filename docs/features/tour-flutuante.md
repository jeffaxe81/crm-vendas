# Assistentes flutuantes do CRM

Tour guiado, configuração inicial da empresa e Configuração Rápida usam agora
o mesmo painel movível. O cabeçalho mostra **Mover painel**, quatro setas e
**Centralizar painel** (⊙). Arraste com mouse/toque ou use esses controles.
Com o cabeçalho em foco, as setas do teclado movem em passos de 20 pixels;
os botões de seta movem 40 pixels. Centralizar reposiciona na janela atual.

O painel é renderizado diretamente em document.body por portal React,
fora das estruturas de layout das telas, com posição fixa em relação à janela.
Isso mantém contexto React, idioma e isolamento por sessão, mas elimina o
acoplamento visual a elementos ancestrais. Não há fundo bloqueando o CRM.

O movimento acompanha eventos na janela, incluindo quando o cursor sai do
cabeçalho, sem depender de setPointerCapture. Há fallback de mouse e toque.
Soltar/cancelar o gesto ou perder foco da janela encerra o arraste. A posição
respeita os limites da janela e é reajustada ao redimensionar o painel.
A posição é temporária; etapas e progresso continuam persistidos pela API.

## Correção após relato de não funcionamento

A implementação anterior só movia o tour das funcionalidades e exigia captura
de ponteiro no cabeçalho. O servidor do responsável não foi acessado, portanto
não foi possível determinar qual dessas limitações explicava a ocorrência.
A correção cobre ambas e oferece controles explícitos se o arraste não funcionar.

Cinco regressões falharam antes da alteração: portal fora do layout, movimento
por eventos da janela sem API de captura, fallback de mouse e controles de
seta/centralizar e proteção temporária sobre iframes. Uma camada transparente
fica ativa somente durante o arraste e é removida ao soltar o gesto. Após a
alteração, a suíte completa e TypeScript Web passaram. Resultado da regressão completa registrado no PR da correção.
A verificação é automatizada em JSDOM; não substitui mouse/toque em navegador
real. Não houve deploy no servidor do responsável nesta tarefa.
