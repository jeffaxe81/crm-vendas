# CRM Vendas — Protótipo no GitHub Pages

Esta branch publica **somente uma demonstração visual e interativa** do CRM Vendas, sem backend.

## Hospedagem

1. Acesse **Settings → Pages** do repositório.
2. Em **Build and deployment → Source**, selecione **Deploy from a branch**.
3. Em **Branch**, escolha **gh-pages** e a pasta **/(root)**; clique em **Save**.
4. Após o Pages terminar a publicação, o endereço esperado é: https://jeffaxe81.github.io/crm-vendas/

O proprietário precisa habilitar a origem de publicação na configuração do repositório caso o GitHub Pages ainda não esteja ativo.

## Incluído

- Painel demonstrativo com indicadores e gráfico de amostra
- Funil Kanban, com arrastar/soltar e seleção de etapa
- Criação de oportunidade fictícia, pesquisa e reinício da demo
- Listas fictícias de empresas, contatos, agenda e chamados
- Relatórios com exportação CSV local de dados de exemplo
- Cores editáveis no navegador e layout responsivo

Os registros usados são inteiramente fictícios e destinados à prototipagem. Novas oportunidades e personalização de cor são armazenadas apenas no `localStorage` do navegador. O botão **Reiniciar demo** descarta essas alterações locais.

**Não existe login real, API, PostgreSQL, envio de dados, criação de backups ou restauração neste protótipo.** Não cadastre dados reais.

## Importante para desenvolvimento

Esta branch é independente da `main`. O backend verdadeiro é uma aplicação separada, implantável apenas em ambiente com API e banco de dados. O Pages não substitui homologação, testes de isolamento de tenants, nem autoriza executar restauração.

Para verificar a sintaxe JavaScript: `node --check assets/app.js`. Abra `index.html` num navegador para uma prévia local.
