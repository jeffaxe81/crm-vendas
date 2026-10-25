# Compatibilidade Unicode das exportações locais

## Escopo

Incremento isolado sobre a consolidação de produtividade da PR #309 (`d05f81e7f5085a688d65ed3dfdd19cbd031d41ae`). Corrigir o formato de linhas VCF/ICS sem mudar campos, autorizações ou conjunto exportado.

## Diagnóstico e alteração

Os exportadores concatenavam propriedades completas sem dobragem. Regressões com nomes/títulos longos produziram linhas de 363 e 563 octetos, respectivamente. A serialização compartilhada agora dobra linhas em até 75 octetos UTF-8, contando o espaço inicial de continuação, sem partir pontos de código. O consumidor recupera a propriedade original ao remover CRLF seguido do espaço. Escapes existentes são aplicados antes da dobragem; CSV permanece inalterado.

## Verificação

- Duas regressões reproduzidas antes da alteração: ambas falharam pelo comprimento das linhas.
- As duas regressões passaram após a alteração, cobrindo preservação de acentos, emojis, japonês, delimitadores e quebras de linha, além de data UTC e status provisório da agenda.
- Suíte completa da interface: 81 arquivos e 656 testes aprovados (`vitest run --maxWorkers=2`). A primeira execução foi interrompida após oito falhas no dashboard causadas por contratos compilados locais desatualizados (`parse` indefinido). Os contratos foram recompilados no worktree, sem mudar seu código, antes da execução completa aprovada.
- TypeScript da interface e formatação dos arquivos alterados verificados.

## Entrega

Branch separada; não altera main nem o deploy local ativo. A PR #309 e seus gates de exportação/homologação continuam aplicáveis. Não há novas rotas, migrações ou operações sobre dados. Este incremento não declara compatibilidade homologada com aplicativos externos específicos.
