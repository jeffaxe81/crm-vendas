# Cycle 2 CRM Core Design

**Status:** aprovado para planejamento
**Base:** `main` no merge commit do Cycle 1
**Branch:** `cycle-2-crm-core`
**Checkpoint alvo:** `v0.2.0-crm-core`
**Escopo:** CRM-001 a CRM-006

## Objetivo

Entregar o núcleo de relacionamento do CRM Axesistemas com empresas, contatos, canais, vínculo empresa-contato, histórico manual, tags e campos customizáveis, preservando o isolamento multiempresa implantado no Cycle 1.

## Limites do ciclo

Incluído:

- empresas;
- contatos independentes de empresa;
- múltiplos canais por contato;
- relacionamento muitos-para-muitos empresa-contato;
- histórico manual de relacionamento;
- tags para empresas e contatos;
- campos customizáveis para empresas e contatos;
- pesquisa simples, paginação, ordenação controlada;
- interface Web para empresas e contatos;
- auditoria de mudanças relevantes;
- testes adversariais entre organizações.

Fora deste ciclo:

- funis e oportunidades;
- tarefas, reuniões, agenda e follow-ups;
- dashboard;
- documentos e hub de conhecimento;
- IA;
- integrações externas;
- fórmulas, scripts ou dependências entre campos customizáveis;
- RLS em PostgreSQL, que permanece obrigatório antes da comercialização externa.

## Arquitetura

O CRM continua como monólito modular NestJS + Next.js no monorepositório pnpm. O novo domínio será dividido por responsabilidades e usará o contexto autenticado do Cycle 1 para resolver `organizationId`. Nenhuma rota de negócio aceitará `organizationId` livre do cliente para decidir o escopo.

Os contratos públicos ficam em `packages/contracts`. A API REST usa `/api/v1`, autenticação JWT existente, RBAC existente, erros padronizados e auditoria append-only. A Web usa os contratos compartilhados e passa a exibir o App Shell aprovado com menu lateral e as áreas funcionais Empresas e Contatos.

## Modelo de dados

### Empresas

`companies`:

- `id` UUID;
- `organization_id` UUID obrigatório;
- `legal_name` varchar(200) obrigatório;
- `trade_name` varchar(200) opcional;
- `document` varchar(32) opcional;
- `website` varchar(500) opcional;
- `notes` text opcional;
- `created_at`, `updated_at`;
- `created_by`, `updated_by` UUID;
- `version` integer para concorrência otimista;
- `deleted_at`, `deleted_by` para exclusão lógica.

A unicidade de `document` será por organização apenas quando preenchido. Exclusão lógica remove a empresa de listagens normais sem apagar histórico.

### Contatos

`contacts`:

- `id` UUID;
- `organization_id` UUID obrigatório;
- `full_name` varchar(200) obrigatório;
- `job_title` varchar(160) opcional;
- `notes` text opcional;
- campos comuns de auditoria e exclusão lógica.

Contato pode existir sem empresa.

### Canais

`contact_channels`:

- `id` UUID;
- `organization_id` UUID obrigatório;
- `contact_id` UUID obrigatório;
- `type` enum `EMAIL | PHONE | MOBILE | WHATSAPP | OTHER`;
- `value` varchar(320);
- `label` varchar(80) opcional;
- `is_primary` boolean;
- `created_at`, `updated_at`.

Regra: no máximo um canal primário por tipo e contato. O serviço valida que contato e canal pertencem à organização ativa.

### Relação empresa-contato

`company_contacts`:

- `id` UUID;
- `organization_id` UUID obrigatório;
- `company_id` UUID obrigatório;
- `contact_id` UUID obrigatório;
- `relationship_label` varchar(120) opcional;
- `is_primary` boolean;
- `created_at`.

Chave única por `(organization_id, company_id, contact_id)`.

### Histórico de relacionamento

`relationship_entries`:

- `id` UUID;
- `organization_id` UUID obrigatório;
- `company_id` UUID opcional;
- `contact_id` UUID opcional;
- `author_user_id` UUID obrigatório;
- `kind` enum `NOTE | CALL_NOTE | EMAIL_NOTE | MEETING_NOTE | OTHER`;
- `content` text obrigatório;
- `occurred_at` timestamptz obrigatório;
- `created_at`.

Ao menos `company_id` ou `contact_id` deve existir. Este histórico é funcional e diferente de `audit_logs`. Ele não cria tarefas, agenda ou follow-up.

### Tags

`tags`:

- `id` UUID;
- `organization_id` UUID obrigatório;
- `name` varchar(80);
- `normalized_name` varchar(80);
- `created_at`.

Unicidade por `(organization_id, normalized_name)`.

Associações explícitas:

- `company_tags(company_id, tag_id, organization_id)`;
- `contact_tags(contact_id, tag_id, organization_id)`.

Não usar relação polimórfica genérica nesta fase; integridade referencial explícita é preferida.

### Campos customizáveis

`custom_field_definitions`:

- `id` UUID;
- `organization_id` UUID obrigatório;
- `scope` enum `COMPANY | CONTACT`;
- `key` varchar(80);
- `label` varchar(120);
- `type` enum `TEXT | NUMBER | BOOLEAN | DATE | SELECT`;
- `is_required` boolean;
- `options` JSONB somente para `SELECT`;
- `is_active` boolean;
- `created_at`, `updated_at`.

Chave única por `(organization_id, scope, key)`.

Valores:

- `company_custom_field_values`;
- `contact_custom_field_values`.

Cada linha referencia exatamente uma definição do escopo correspondente e armazena `value` em JSONB. O serviço valida tipo, obrigatoriedade, opções e pertencimento à organização. Fórmulas e dependências ficam fora do Cycle 2.

## Permissões

Usar as permissões já existentes:

- `company.read` / `company.write`;
- `contact.read` / `contact.write`.

Regras iniciais:

- `ADMIN`, `MANAGER`, `SELLER`: leitura e escrita conforme mapa atual;
- `VIEWER`: somente leitura;
- nenhuma operação cruza organizações;
- regras finas de propriedade do Vendedor ficam fora deste ciclo, já que o domínio ainda não possui owner/responsável comercial formal.

## API

Rotas principais:

- `GET /api/v1/companies`;
- `POST /api/v1/companies`;
- `GET /api/v1/companies/:id`;
- `PATCH /api/v1/companies/:id`;
- `DELETE /api/v1/companies/:id` (exclusão lógica);
- `GET /api/v1/contacts`;
- `POST /api/v1/contacts`;
- `GET /api/v1/contacts/:id`;
- `PATCH /api/v1/contacts/:id`;
- `DELETE /api/v1/contacts/:id` (exclusão lógica);
- `POST/PATCH/DELETE /api/v1/contacts/:id/channels`;
- `POST/DELETE /api/v1/companies/:companyId/contacts/:contactId`;
- `GET/POST /api/v1/relationship-entries`;
- `GET/POST/PATCH /api/v1/tags`;
- endpoints de vinculação de tags em empresa e contato;
- `GET/POST/PATCH /api/v1/custom-fields`;
- endpoints de valores customizados por empresa e contato.

Listagens usam `page`, `limit`, `q` e ordenação permitida. `limit` máximo 100.

## Web

Após login, a aplicação mostra App Shell com menu lateral. Neste ciclo, os itens funcionais são:

- Empresas;
- Contatos.

Empresa:

- listagem/pesquisa;
- criar/editar;
- ficha com resumo, contatos, histórico, tags e campos customizados.

Contato:

- listagem/pesquisa;
- criar/editar;
- canais múltiplos;
- ficha com empresas relacionadas, histórico, tags e campos customizados.

A interface deve funcionar em desktop e telas menores. Tabelas podem virar cartões. Ações de edição precisam de alternativa por teclado e mensagens de validação próximas ao campo.

## Auditoria

Registrar, sem segredos:

- `company.created`, `company.updated`, `company.deleted`;
- `contact.created`, `contact.updated`, `contact.deleted`;
- criação/alteração/remoção de canais;
- vínculo/desvínculo empresa-contato;
- criação de histórico;
- criação/alteração de tags e vínculos;
- criação/alteração de definições e valores customizados.

O histórico funcional não substitui auditoria.

## Testes e critérios de aceite

O checkpoint só pode existir se o mesmo SHA comprovar:

1. migration reproduzível em PostgreSQL vazio;
2. empresas CRUD + exclusão lógica;
3. contatos CRUD, inclusive sem empresa;
4. múltiplos canais e regra de primário;
5. relação muitos-para-muitos empresa-contato;
6. histórico manual separado de auditoria;
7. tags com integridade referencial e isolamento;
8. campos customizados validados por tipo e organização;
9. `VIEWER` sem escrita;
10. token da organização A incapaz de ler ou alterar IDs da organização B;
11. paginação e pesquisa simples;
12. E2E Web: login -> criar empresa -> criar contato -> vincular -> registrar histórico;
13. Prettier, lint, typecheck, unitários, integração, build, E2E, Compose e Docker verdes;
14. README/changelog/documentação de retorno atualizados.

## Retorno

Rollback funcional continua possível para `v0.1.0-identity-access` até o checkpoint do Cycle 2 ser aprovado. A tag alvo `v0.2.0-crm-core` só será criada após gate integral verde e aprovação pós-testes.
