# NEO Interact — integração iframe no CRM-Vendas

## Estado atual

O menu **Comunicação** já existe no CRM. A URL e o modo agora podem ser administrados por organização no módulo **Chaves de integração**. A configuração por variáveis de ambiente permanece como referência para ambientes de teste sem sessão autenticada.

```dotenv
NEO_INTERACT_URL=https://neo.example.com/neo/
NEO_INTERACT_MODE=iframe
NEO_INTERACT_FRAME_HEIGHT=800
NEO_INTERACT_FRAME_MAX_WIDTH=1600
WEB_ORIGIN=https://crm.example.com
```

Para abrir o NEO em outra aba sem incorporar o site, defina
`NEO_INTERACT_MODE=tab`. A URL é obrigatoriamente HTTPS, sem credenciais,
parâmetros de consulta ou fragmento. Um URL HTTP usado apenas em laboratório
**não** é aceito por este componente.

## Pré-requisito no NEO

A aplicação NEO precisa autorizar explicitamente a origem do CRM para
incorporação. Uma resposta `Content-Security-Policy: frame-ancestors 'self'`
bloqueia a incorporação entre origens. É necessário solicitar a configuração
apropriada à equipe administradora do NEO e confirmar sua aplicação na resposta
do endereço realmente usado no iframe. Não contornar a restrição por proxy.

O caminho `/portal/` e o caminho `/neo/` são distintos: usar somente o
endpoint validado para a respectiva instalação.

## Protocolo e segurança

- A mensagem `init` é enviada ao endereço de origem exato do NEO após o
  evento `load` do iframe.
- Somente `TOGGLE_IFRAME_SIZE` com origem, janela emissora e payload válidos
  pode alterar as dimensões do iframe.
- O evento `load` **não** comprova autenticação, acesso permitido ou serviço
  operacional. Uma mensagem de redimensionamento comprova somente comunicação
  técnica para esse evento.
- O CRM não recebe, armazena nem transmite senha ou token do NEO.
- O usuário dispõe do modo nova aba quando a política do navegador ou do NEO
  impede a incorporação.

## Homologação

1. Verificar URL e HTTPS no ambiente de destino.
2. Confirmar autorização de frame pela resposta do NEO.
3. Validar carregamento visual, login e operação de voz/chat manualmente.
4. Verificar permissões de microfone e câmera quando aplicável.
5. Injetar mensagens de origens e janelas não autorizadas e confirmar rejeição.
6. Verificar redimensionamento, navegação entre módulos e abertura em nova aba.
7. Confirmar que indisponibilidade do NEO não bloqueia o CRM.

## Evoluções não implementadas

- Painel lateral sobreposto/minimizado em todas as telas do CRM.
- Associação de chamadas a contatos e eventos avançados da integração.
- SSO entre CRM e NEO.

Esses recursos exigem desenho de permissões e modelo multi-tenant e, no caso
dos eventos avançados, confirmação do protocolo disponibilizado pelo NEO.
\n## Configuração por organização\n\nAplicar a migração `20261009180000_neo_communication_settings` antes de liberar a nova tela. A API `GET/PUT /integrations/neo-communication` exige sessão autenticada; a atualização exige `integration.manage`. O formulário aparece na administração de integrações. Sem registro habilitado, a comunicação da organização fica desativada, independentemente de outras organizações. A janela continua sujeita à política de incorporação do NEO.\n