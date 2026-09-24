# C4.2.2 — Importação CSV de Contatos — Design

## Contexto

A C4.2.1 — Importação CSV de Empresas está integrada à `develop` com o fluxo **Preview → Confirmar**. O checkpoint da C4.2.1 define como próximo passo a próxima microentrega de Importação, sem antecipar Produtos/Relatórios. A base já possui o domínio de contatos (`ContactCreateInputSchema`), canais (`ContactChannelInputSchema`), autorização por `contact.write`, isolamento por tenant (RLS) e auditoria de criação de contato e de canal.

## Objetivo

Permitir que um usuário autorizado importe até 500 contatos por arquivo CSV, com seus canais principais (e-mail, telefone, celular e WhatsApp), usando o mesmo fluxo seguro da C4.2.1: validação por linha no preview, confirmação explícita e resumo final.

## Escopo da C4.2.2

Incluído:

- endpoints `POST /api/v1/contact-imports/preview` e `POST /api/v1/contact-imports/confirm` (multipart, campo `file`; `fingerprint` na confirmação);
- permissão `contact.write` nos dois endpoints;
- limite de 500 linhas de dados e 8 MB por arquivo;
- reutilização de `ContactCreateInputSchema` e `ContactChannelInputSchema`;
- canais opcionais por linha, cada um criado como principal do seu tipo;
- deduplicação por e-mail, sem diferenciar maiúsculas de minúsculas: dentro do arquivo e contra contatos ativos do mesmo tenant;
- fingerprint SHA-256 entre preview e confirmação;
- criação atômica por linha (contato e canais na mesma transação) com auditoria `contact.created` e `contact.channel_created`;
- UI na tela de Contatos: botão **Importar CSV**, preview com erros por linha, confirmação e resumo;
- parser CSV extraído para um componente genérico reutilizado por empresas e contatos, sem mudança de comportamento na C4.2.1.

Fora do escopo:

- vínculo automático com empresas (por exemplo, por documento da empresa), que fica para uma microentrega posterior;
- atualização, merge ou sobrescrita de contatos existentes;
- deduplicação por nome ou telefone;
- filas, jobs persistentes, XLS/XLSX e mapeamento manual de colunas.

## Formato do CSV

```text
fullName,jobTitle,email,phone,mobile,whatsapp,notes
```

Regras:

- `fullName` é obrigatório no cabeçalho e em cada linha;
- demais colunas são opcionais, e a ordem pode variar;
- colunas desconhecidas ou duplicadas invalidam o arquivo;
- UTF-8 com ou sem BOM; delimitador `,` ou `;` autodetectado; campos entre aspas com quebras de linha;
- linhas totalmente vazias são ignoradas;
- `email` precisa ter formato de e-mail válido.

## Mapeamento de canais

| Coluna     | Tipo do canal | Principal |
| ---------- | ------------- | --------- |
| `email`    | `EMAIL`       | sim       |
| `phone`    | `PHONE`       | sim       |
| `mobile`   | `MOBILE`      | sim       |
| `whatsapp` | `WHATSAPP`    | sim       |

## Regras de validação por linha

- erros do `ContactCreateInputSchema` e do `ContactChannelInputSchema` são reportados por linha;
- e-mail repetido no arquivo: `E-mail duplicado no arquivo de importação.`;
- e-mail já usado por contato ativo do tenant: `E-mail já cadastrado para outro contato.`;
- uma linha inválida não impede as válidas; nada é gravado no preview.

## Segurança e isolamento

- o tenant vem exclusivamente do principal autenticado;
- a verificação de e-mails existentes roda dentro de `withTenant` e só enxerga o tenant atual;
- a confirmação recalcula o preview e recusa um fingerprint divergente.

## Critérios de aceite

1. `VIEWER` recebe 403 no preview.
2. O preview não grava nada e reporta erros por linha.
3. E-mail existente em outro tenant não conta como duplicado.
4. A confirmação cria somente as linhas válidas, com canais, e audita com o `x-request-id` da requisição.
5. Um CSV inválido ou um fingerprint divergente devolve 400.
6. A tela de Contatos mostra a ação apenas para sessões com `contact.write`.
7. Os testes da C4.2.1 continuam passando sem alteração.
