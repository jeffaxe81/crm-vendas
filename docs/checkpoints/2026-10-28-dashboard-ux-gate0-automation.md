# Evidência automatizada de UX dos dashboards

O PR #316 acrescenta quatro jornadas Playwright: desktop com skip-link e largura útil, drawer mobile com Escape e retorno de foco, política persistida de idioma PT-BR/EN/ES e troca de sessão entre dois tenants sintéticos com volumes distintos.

## Diagnóstico do teste de teclado

Na CI `40742272504`, em `7b94ecb7`, 11 jornadas passaram e uma falhou: após A primeira hipótese foi que `blur()` não reiniciava a posição de navegação sequencial do Chromium. Focar o body com `tabindex=-1` temporário resolveu uma reprodução mínima em dez páginas novas. Uma tentativa anterior reutilizava a mesma página com `setContent` e não reproduzia o estado inicial de forma estável. Essa reprodução mínima não representava toda a aplicação: a CI `40754345491`, em `9a1d43b3`, repetiu a falha do skip-link, com outras 11 jornadas aprovadas.

O diagnóstico seguinte usou a aplicação real em servidor Next.js de desenvolvimento isolado, porta 3333, com todas as chamadas de API interceptadas e respostas sintéticas, sem acesso ao banco. Ao focar o body e pressionar Tab, `document.activeElement` era `nextjs-portal`; dentro do shadow DOM, o foco estava no botão `Open Next.js Dev Tools`. Esse elemento é inserido antes da aplicação no modo de desenvolvimento utilizado pela CI.

A preparação agora foca a fronteira `.crm-shell` com `tabindex=-1` temporário e restaura seu atributo original. Tab e Enter continuam reais: o teste exige foco no skip-link e depois no conteúdo. Não foca diretamente o link que pretende verificar, nem desativa os controles da aplicação. Dez repetições com a interface real em modo de desenvolvimento passaram, incluindo a restauração do atributo. As respostas de API foram simuladas apenas nessa investigação local; as jornadas do PR continuam usando a API real e tenants sintéticos do ambiente descartável de CI. O servidor local precisou usar Webpack porque o Turbopack rejeitou dependências compartilhadas por symlinks fora da raiz; o workflow permanece inalterado.

## Verificação reproduzível

Em ambiente descartável, com aplicação e banco sintéticos configurados para o Playwright:

```sh
pnpm test:e2e -- dashboard-gate0-ux.spec.ts
```

O gate completo é o workflow `Cycle 1 quality gate` no SHA candidato do PR. A aptidão para integração depende do resultado dessa execução, não apenas da reprodução mínima ou de verificações anteriores.

## Limites

Essa automação não aprova produção nem conclui as issues #255 e #256. Permanecem pendentes staging com três organizações, HTTPS/ingress e cabeçalhos via proxy, avaliação humana com leitor de tela, aceite de retenção e privacidade, break-glass/MFA e janela de implantação. O atraso controlado da resposta no teste de troca de sessão exercita a renderização durante carregamento; não é medição de performance ou teste de carga. Não foram usados dados de clientes nem a base local implantada.
