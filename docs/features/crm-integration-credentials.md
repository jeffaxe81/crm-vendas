# Chaves de integração no CRM

A seção **Administração → Chaves de integração** usa a API pública já
existente da organização. O menu e a listagem exigem `integration.read`.
Criar ou revogar exige também `integration.manage`. Esses controles são
aplicados novamente no servidor.

## Criar uma chave

1. Informe um nome que identifique o sistema externo.
2. Selecione as permissões necessárias. A tela oferece os escopos publicados
   de Empresas, Contatos e Oportunidades que seu perfil possui. Não é possível
   delegar administração ou Superusuário pela tela.
3. Opcionalmente, informe uma expiração futura no horário local do navegador.
   A API recebe a data convertida para UTC. Sem data, a chave não expira
   automaticamente.
4. Selecione **Criar chave** e guarde a chave exibida. Ela não poderá ser
   consultada novamente. **Copiar chave** exige uma ação explícita e depende
   da permissão de área de transferência do navegador; também é possível
   selecioná-la e copiar manualmente.
5. Selecione **Já guardei a chave** para fechar a exibição. Navegar para outra
   seção ou sair do CRM também remove o segredo da tela. O CRM não salva a
   chave em armazenamento do navegador.

Enquanto uma nova chave está visível, o formulário de criação fica oculto,
para evitar substituí-la acidentalmente. A lista mostra apenas o prefixo,
as permissões, o estado, a expiração e o último uso.

## Utilizar e revogar

O sistema externo usa a chave como `Authorization: Bearer <chave>` nos
endpoints publicados. A organização é determinada pela credencial. Os
escopos efetivos também são limitados pelas permissões atuais de quem a criou;
uma mudança de perfil pode reduzir o acesso da chave.

**Revogar** apresenta uma confirmação. **Confirmar revogação** interrompe o
acesso dos sistemas que usam aquela chave; o cadastro permanece no histórico.
Uma falha da API é apresentada e não muda o estado da chave na tela.

**Atualizar lista** e **Tentar novamente** permitem consultar o estado atual
e recuperar uma listagem indisponível. A tela não configura webhooks nem
executa sincronizações automaticamente.
