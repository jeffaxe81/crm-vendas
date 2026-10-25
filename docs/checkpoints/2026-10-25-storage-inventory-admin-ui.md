# Tela administrativa do inventário global de backups

Base: main `8f1454d6`. Incremento separado da API da PR #311: seção manual no painel existente de Superusuário, sem novas rotas ou mudanças de permissão.

## Entrega

- Totais globais, bytes conhecidos exatos e consumo por empresa.
- Filtro de ocorrências e paginação local das duas tabelas, 20 linhas por página.
- Contrato Zod compartilhado com os tipos do serviço da API; o código de execução da API não muda.
- Consulta somente por clique, sem query de tenant e com no-store.
- Estado isolado por token, respostas tardias ignoradas e relatório anterior descartado ao atualizar/errar.
- Armazenamento indisponível e resultado parcial não aparecem como varredura concluída.
- 42 mensagens adicionadas em português, inglês e espanhol.

## Verificação

Contrato permissivo inicial: 9 regressões falharam e 2 passaram; painel inicial: 7 regressões falharam. Após implementar, as suítes completas passaram: 143 testes de contratos (25 arquivos) e 666 da interface (82 arquivos). Incluem painel de backups existente, precisão acima de Number.MAX_SAFE_INTEGER, espera/erro, sessão trocada com resposta pendente, resultado concluído descartado ao trocar de sessão, filtro e paginação sem varredura adicional.

Revisão independente do diff não encontrou achados relevantes ou menores acionáveis. Tipos da API/interface e formatação são verificados antes do commit. O CI integral do SHA candidato permanece como gate de integração. Não há novo deploy nem aceite de homologação/produção neste checkpoint.
