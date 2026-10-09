# Comunicação integrada — NEO Interact no CRM

A seção **Comunicação integrada** permite acessar o NEO Interact por iframe ou em outra aba. A incorporação utiliza o protocolo do AXE Dispatch (D-006). O menu segue a permissão existente `ticket.read`, usada pelo atendimento do CRM. O NEO mantém sua própria autenticação e autorização; não há login automático nem transmissão de clientes, oportunidades, tokens do CRM ou outros dados de atendimento.

## Configuração e atualização no Windows

Atualize a branch de implantação após integrar a entrega:

```powershell
git pull origin main
notepad .env
```

Inclua no `.env` a URL do seu ambiente autorizado do NEO Interact:

```dotenv
NEO_INTERACT_URL=https://seu-ambiente-autorizado/neo/
```

Escolha o modo de abertura. Para um ambiente que bloqueia iframe, use:

```dotenv
NEO_INTERACT_MODE=tab
```

Nesse modo, a seção apresenta **Abrir em outra aba** e não cria iframe. A
abertura depende do clique do usuário. O NEO mantém seu login e suas políticas
de acesso; a aba permanece aberta durante a navegação no CRM. O endereço deve
apontar para o portal real usado pelo cliente, por exemplo `/portal/` quando
esse for o caminho de acesso do ambiente.

Para incorporação autorizada, use `NEO_INTERACT_MODE=iframe` (padrão quando o
modo não está definido). As dimensões podem ser configuradas:

```dotenv
NEO_INTERACT_FRAME_HEIGHT=800
NEO_INTERACT_FRAME_MAX_WIDTH=1600
```

Ambos os valores são inteiros entre 320 e 1600 pixels. A largura permanece
limitada também ao espaço disponível na tela. Altura e largura não têm efeito
na aba externa. Modo ou dimensões inválidos deixam a configuração indisponível.

O endereço é apenas um exemplo: substitua pelo ambiente real. A referência usada pelo Dispatch é `https://gscprj.saas.digitro.cloud/neo/`; confirme a autorização para utilizar esse ambiente antes de configurá-lo. A URL deve usar HTTPS e não pode conter credenciais, parâmetros de consulta ou fragmentos com tokens. Não informe a senha de acesso nessa configuração.

Recompile o frontend e recrie o serviço:

```powershell
docker compose -f compose.yaml up -d --build web
docker compose -f compose.yaml ps
```

A configuração é lida pelo Next.js no servidor, durante cada requisição, e é passada ao navegador como configuração pública da aplicação incorporada. Alterações posteriores no endereço, modo ou dimensões do NEO não exigem rebuild:

```powershell
docker compose -f compose.yaml up -d --force-recreate web
```

Com o endereço vazio, a seção informa que a comunicação ainda não foi configurada e não carrega um iframe. Com configuração inválida, a seção permanece indisponível. O endereço é compartilhado pelo ambiente de implantação, assim como a configuração do Dispatch; não há editor de configuração individual por organização nesta entrega.

## Operação

- No modo `iframe`, o iframe é criado somente na primeira abertura da seção, após autenticação no CRM e com `ticket.read`.
- No modo `iframe`, ao trocar de seção, o iframe permanece montado e fica oculto. Isso evita reiniciar sua sessão ou comunicação durante a navegação. Ao sair do CRM, ele é removido. O encerramento da sessão externa segue as regras do próprio NEO.
- O botão **Recarregar** reinicia explicitamente o iframe. Evite usá-lo durante um atendimento ativo.
- O link **Abrir em outra aba** permite acessar o mesmo endereço em ambos os modos. Ele não transfere a sessão nem o atendimento entre abas.
- O login e as permissões de microfone/câmera são concedidos pelo navegador e pelo NEO. A navegação interna do CRM não concede acesso ao NEO.

## Protocolo compatível com Dispatch

No evento `load`, o iframe recebe somente `{ type: "init", timestamp: ... }`, com `targetOrigin` igual à origem HTTPS configurada. O carregamento do documento não comprova autenticação, disponibilidade de mídia ou conclusão do login.

Mensagens `TOGGLE_IFRAME_SIZE` só são processadas quando `event.origin` corresponde à origem configurada e `event.source` corresponde à janela atual do iframe. O payload valida `isExpanded`, largura e altura; valores inválidos são ignorados. A largura fica limitada ao contêiner e ao máximo configurado, e a altura fica entre 320 e 1600 pixels. Ao recolher, o componente volta a 100% de largura (limitada ao máximo configurado) e à altura configurada. ResizeObserver ajusta a largura ao redimensionar o menu, a janela ou o dispositivo sem recarregar a sessão.

O serviço externo precisa permitir incorporação pela origem do CRM em sua política CSP `frame-ancestors`/`X-Frame-Options`. Cookies entre sites, mídia WebRTC, HTTPS do CRM e políticas de câmera/microfone também devem ser homologados no ambiente real. Alguns bloqueios de iframe não disparam erro no navegador; por isso o link externo permanece disponível mesmo quando o evento `load` ocorreu.

## Homologação

1. Confirmar login no CRM e visibilidade da seção com a permissão de atendimento.
2. Abrir a seção, efetuar login no NEO e verificar permissões de áudio/vídeo conforme o uso.
3. Navegar por empresas, contatos e oportunidades e voltar à comunicação: a sessão deve continuar montada.
4. Redimensionar a janela e recolher o menu sem causar reconexão ou rolagem horizontal do CRM.
5. Validar estados sem configuração, falha de carregamento e acesso em outra aba.
6. Homologar chamada/mensageria no NEO real. A entrega do componente não comprova o funcionamento desses serviços externos.
