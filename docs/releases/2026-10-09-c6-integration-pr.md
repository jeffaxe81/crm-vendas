# C6 — Administrar chaves de integração e escolher a abertura do NEO

A API de credenciais já existia, mas o administrador não tinha uma tela para
gerenciar as chaves. A nova seção **Administração → Chaves de integração**
permite listar, criar e revogar chaves pela API existente, respeitando as
permissões e mostrando o segredo uma única vez.

O NEO pode ser configurado com `NEO_INTERACT_MODE=tab` para abrir por um link
em outra aba, sem montar iframe. O modo `iframe` permanece como padrão e
aceita altura inicial/largura máxima de 320 a 1600 pixels. O Compose repassa
as opções em runtime; a configuração segue por ambiente.

- Escopos selecionáveis limitados aos domínios publicados e às permissões
  atuais da sessão.
- Expiração opcional convertida de horário local para UTC.
- Segredo apenas em memória, removido ao fechar, navegar ou sair.
- Revogação com confirmação e tratamento de falhas sem indicar sucesso falso.
- Nenhuma migration, alteração de autorização do servidor ou operação
  destrutiva de dados.

Validação local após incorporar a main com #103: 263 testes Web, 95 de
contratos, lint, typecheck, formatação, fundação documental, 5 testes de
repositório sem Docker e build Web com saída 0. RED funcional observado em
17 cenários NEO e 8 cenários de credenciais. Revisão independente sem
falhas Critical/Important de produto; prefixo do teste E2E corrigido para
o gerador real `axk_`.

O novo E2E cria a chave pela tela, consulta Empresas, verifica rejeição de
Contatos sem escopo, remove a exibição do segredo e revoga o acesso da chave.
Ele foi reconhecido pelo Playwright junto aos 6 cenários existentes. Execução
E2E, PostgreSQL, Compose e Docker ainda dependem do gate integral do GitHub.
Manter o PR como draft até esse gate passar.
