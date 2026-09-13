# C4.2.1 — Importação CSV de Empresas — Design

## Contexto

A Fase 2 — Produtividade já possui a C4.1 — Agenda Comercial integrada à `main`. O próximo bloco aprovado é a C4.2 — Importação, iniciando por empresas. A base atual já possui o domínio canônico de empresas, validação compartilhada (`CompanyCreateInputSchema`), autorização por `company.write`, isolamento por tenant e auditoria de criação. A importação deve reutilizar essas garantias e não criar um caminho paralelo de persistência.

## Objetivo

Permitir que um usuário autorizado importe até 500 empresas por arquivo CSV com um fluxo seguro de **Preview → Confirmar**, recebendo validação por linha antes de qualquer gravação e um resumo final de processados, importados e rejeitados.

## Escopo da C4.2.1

Incluído:

- upload de arquivo CSV para importação de empresas;
- limite de 500 linhas de dados por arquivo, além do cabeçalho;
- leitura e validação server-side;
- preview obrigatório antes da gravação;
- validação das colunas e de cada linha;
- relatório de erros por linha;
- confirmação explícita da importação após preview;
- criação somente de linhas válidas;
- reutilização do `CompanyCreateInputSchema` como contrato de negócio da empresa;
- reutilização da permissão `company.write`;
- derivação do tenant exclusivamente do principal autenticado;
- auditoria das empresas efetivamente criadas;
- resumo final com `processados`, `importados` e `rejeitados`.

Fora do escopo:

- atualização, merge ou sobrescrita de empresas existentes;
- importação de contatos;
- importação de oportunidades;
- importação de atividades;
- filas, workers ou processamento assíncrono;
- agendamento de importações;
- histórico persistente de jobs de importação;
- importação XLS/XLSX;
- mapeamento manual de colunas;
- deduplicação fuzzy por IA;
- enriquecimento automático de dados;
- rollback global de uma importação já confirmada.

## Formato do CSV

A primeira versão trabalha com cabeçalho fixo e explícito, alinhado ao contrato atual de empresas:

```text
legalName,tradeName,document,website,notes
```

Regras:

- `legalName` é obrigatório;
- `tradeName`, `document`, `website` e `notes` são opcionais;
- colunas desconhecidas são rejeitadas no preview para evitar importações silenciosamente incorretas;
- a ausência de `legalName` invalida o arquivo;
- ordem das colunas pode variar;
- arquivos UTF-8 são suportados, inclusive com BOM;
- delimitadores `,` e `;` são aceitos por autodetecção simples na linha de cabeçalho;
- campos entre aspas podem conter delimitadores e quebras de linha conforme CSV padrão;
- linhas completamente vazias são ignoradas antes da contagem do limite de 500 linhas;
- o limite de 500 considera somente linhas de dados não vazias.

## Fluxo de usuário

### 1. Seleção do arquivo

Na área de Empresas, o usuário com `company.write` verá a ação **Importar CSV**. Ao escolher um arquivo, o browser enviará o conteúdo ao endpoint de preview.

### 2. Preview

O servidor:

1. valida autenticação e `company.write`;
2. valida tipo/tamanho básico do arquivo;
3. interpreta o CSV;
4. valida cabeçalho;
5. rejeita arquivos com mais de 500 linhas de dados;
6. converte cada linha para um candidato de `CompanyCreateInput`;
7. executa `CompanyCreateInputSchema.safeParse()` em cada candidato;
8. verifica conflitos determinísticos de duplicidade;
9. devolve um preview com cada linha classificada como `VALID` ou `INVALID` e suas mensagens.

Nenhuma empresa é criada nesta etapa.

### 3. Confirmação

Após visualizar o preview, o usuário confirma. O cliente envia novamente o conteúdo do arquivo e um `previewFingerprint` calculado pelo servidor no preview. O servidor recalcula o fingerprint do conteúdo normalizado e rejeita a confirmação se o arquivo tiver sido alterado entre preview e confirmação.

O servidor repete as validações de negócio e de duplicidade antes de criar os registros. Isso impede que o cliente transforme o preview em fonte de confiança.

### 4. Resultado

A resposta de confirmação contém:

```ts
type CompanyImportResult = {
  processed: number;
  imported: number;
  rejected: number;
  rows: Array<{
    rowNumber: number;
    status: "IMPORTED" | "REJECTED";
    companyId?: string;
    errors: string[];
  }>;
};
```

## Arquitetura

A C4.2.1 adicionará um módulo de aplicação focado em importação de empresas, sem alterar o modelo de dados de `Company`.

Responsabilidades propostas:

- `CompanyImportController`: autenticação, autorização, upload, preview e confirmação;
- `CompanyImportService`: orquestra parsing, validação, fingerprint, checagem de duplicidade e criação;
- `CompanyCsvParser`: converte bytes/texto CSV em linhas tipadas e normalizadas;
- contratos compartilhados em `@axes/contracts`: tipos das respostas de preview/confirmação quando usados também pela Web;
- `CompaniesService`: continua sendo a fonte canônica para criação e auditoria de uma empresa. A importação não escreve diretamente por Prisma quando puder reutilizar `CompaniesService.create()`.

Não haverá nova tabela nem migration nesta microentrega.

## Endpoints

### `POST /api/v1/company-imports/preview`

Requer `company.write`.

Entrada: arquivo CSV em `multipart/form-data`.

Saída:

```ts
type CompanyImportPreview = {
  fingerprint: string;
  processed: number;
  valid: number;
  invalid: number;
  rows: Array<{
    rowNumber: number;
    status: "VALID" | "INVALID";
    data: {
      legalName?: string;
      tradeName?: string;
      document?: string;
      website?: string;
      notes?: string;
    };
    errors: string[];
  }>;
};
```

### `POST /api/v1/company-imports/confirm`

Requer `company.write`.

Entrada: mesmo arquivo CSV do preview + `fingerprint` retornado anteriormente.

Comportamento:

- recalcula parsing, validação e duplicidade;
- rejeita se o fingerprint não corresponder;
- cria apenas as linhas válidas no momento da confirmação;
- linhas que se tornarem inválidas por corrida de concorrência são retornadas como `REJECTED`;
- não usa transação única para todo o arquivo: uma linha inválida não desfaz as linhas válidas já importadas;
- cada criação passa pelo mesmo fluxo de auditoria do domínio de empresas.

## Duplicidade

A regra inicial é conservadora para evitar sobrescrita silenciosa.

Uma linha é rejeitada como duplicada quando:

1. possui `document` e já existe empresa ativa do mesmo tenant com o mesmo `document` após `trim` e comparação case-insensitive; ou
2. possui `document` e outra linha válida do mesmo arquivo usa o mesmo `document` normalizado.

Na ausência de `document`, a importação não tentará inferir duplicidade por nome. Isso evita falsos positivos entre empresas legitimamente homônimas.

Não haverá update/merge automático nesta versão.

## Segurança e multiempresa

- `organizationId` nunca é aceito do CSV, query string ou body como fonte de autorização;
- tenant deriva exclusivamente do principal autenticado;
- o endpoint exige `company.write`;
- todas as consultas de duplicidade executam no contexto tenant-aware existente;
- criação reutiliza o contexto de auditoria atual com `actorUserId`, `requestId` e IP;
- o fingerprint não é token de autorização; serve apenas para detectar mudança do arquivo entre preview e confirmação;
- mensagens de erro de duplicidade não expõem dados de outros tenants.

## Tratamento de erros

Erros de arquivo inteiro retornam HTTP 400 com `code: "VALIDATION_ERROR"`, incluindo casos como:

- arquivo ausente;
- CSV ilegível;
- cabeçalho inválido;
- coluna obrigatória ausente;
- coluna desconhecida;
- mais de 500 linhas;
- fingerprint ausente ou divergente na confirmação.

Erros de linha permanecem dentro do payload de preview/resultado, permitindo importação parcial das linhas válidas.

Erros inesperados de infraestrutura seguem o filtro padrão da API e não devem ser convertidos em erros de linha silenciosos.

## Web

A primeira UI será adicionada à área de Empresas, sem criar um módulo visual independente.

Elementos:

- botão **Importar CSV** visível somente com `company.write`;
- seletor de arquivo `.csv`;
- estado de envio/preview;
- tabela de preview com número da linha, nome da empresa, status e erros;
- resumo de válidas/inválidas;
- botão **Confirmar importação** habilitado somente quando houver ao menos uma linha válida;
- resultado final com processados/importados/rejeitados;
- ação para fechar o fluxo e recarregar a listagem de empresas.

## Testes

### Contratos/parser

Cobrir:

- cabeçalho válido;
- `;` e `,`;
- BOM UTF-8;
- campos com aspas e delimitadores internos;
- linha vazia;
- campo obrigatório ausente;
- URL inválida;
- coluna desconhecida;
- 500 linhas aceitas;
- 501 linhas rejeitadas.

### API

Cobrir:

- preview não persiste empresa;
- confirmação cria linha válida;
- linha inválida é rejeitada sem bloquear linhas válidas;
- usuário sem `company.write` recebe 403;
- tenant A não detecta/expõe empresa do tenant B como duplicidade;
- duplicidade de `document` no próprio tenant é rejeitada;
- duplicidade dentro do arquivo é rejeitada;
- fingerprint divergente retorna 400;
- auditoria é gerada para cada empresa criada.

### Web

Cobrir:

- botão respeita `company.write`;
- preview mostra resumo e erros por linha;
- confirmação usa o fingerprint devolvido pelo preview;
- confirmação não ocorre quando não há linha válida;
- resultado final mostra processados/importados/rejeitados.

### Gate final

Executar o gate completo do repositório ao final da microentrega, incluindo testes unitários/integrados, typecheck, formatação, E2E aplicável e build Docker da API/Web, seguindo o padrão das microentregas anteriores.

## Critérios de aceite

A C4.2.1 será considerada concluída quando:

1. um usuário autorizado conseguir selecionar um CSV e receber preview sem persistência;
2. o preview classificar corretamente linhas válidas e inválidas;
3. arquivos com mais de 500 linhas forem rejeitados;
4. confirmação criar somente linhas válidas;
5. empresas existentes nunca forem sobrescritas ou atualizadas;
6. duplicidade por `document` do mesmo tenant for rejeitada;
7. tenant nunca for derivado do arquivo;
8. cada empresa criada gerar auditoria pelo fluxo canônico;
9. UI exibir o resumo final da importação;
10. testes de segurança/multiempresa e gate final estiverem GREEN.

## Próximos blocos após C4.2.1

Somente após o fechamento desta microentrega:

- C4.2.2/C4.2.x: evolução do motor de importação conforme necessidade real;
- importação de contatos;
- Produtos;
- Relatórios.

Esses itens não fazem parte da implementação automática da C4.2.1.
