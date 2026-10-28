# Evidência automatizada de UX dos dashboards

O PR #316 acrescenta quatro jornadas Playwright: desktop com skip-link e largura útil, drawer mobile com Escape e retorno de foco, política persistida de idioma PT-BR/EN/ES e troca de sessão entre dois tenants sintéticos com volumes distintos.

## Diagnóstico do teste de teclado

Na CI `40742272504`, em `7b94ecb7`, 11 jornadas passaram e uma falhou: após `blur()` e Tab, o skip-link não recebeu foco. A API, os testes de componentes, tipos e build passaram nessa execução; o gate integral permaneceu reprovado.

`blur()` não reinicia a posição de navegação sequencial do Chromium. A preparação agora foca o início do documento com `tabindex=-1` temporário no body e restaura o atributo original. O teste continua pressionando Tab e Enter e exigindo foco no skip-link e no conteúdo; não foca diretamente o link que pretende verificar.

Reprodução mínima local com `/usr/bin/chromium`, sem API ou banco: dez páginas novas reproduziram a falha da preparação anterior e passaram com a nova preparação, incluindo foco no conteúdo após Enter e restauração do atributo do body. Uma primeira tentativa reutilizou a mesma página com `setContent`; a premissa de repetição do estado inicial não se sustentou, por isso a reprodução foi refeita com páginas novas. Essa reprodução não equivale à execução das jornadas completas.

## Verificação reproduzível

Em ambiente descartável, com aplicação e banco sintéticos configurados para o Playwright:

```sh
pnpm test:e2e -- dashboard-gate0-ux.spec.ts
```

O gate completo é o workflow `Cycle 1 quality gate` no SHA candidato do PR. A aptidão para integração depende do resultado dessa execução, não apenas da reprodução mínima ou de verificações anteriores.

## Limites

Essa automação não aprova produção nem conclui as issues #255 e #256. Permanecem pendentes staging com três organizações, HTTPS/ingress e cabeçalhos via proxy, avaliação humana com leitor de tela, aceite de retenção e privacidade, break-glass/MFA e janela de implantação. O atraso controlado da resposta no teste de troca de sessão exercita a renderização durante carregamento; não é medição de performance ou teste de carga. Não foram usados dados de clientes nem a base local implantada.
