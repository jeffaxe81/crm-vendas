# Manual do MANAGER — Release 1.2

## Para quem é

O MANAGER é orientado à organização da operação comercial. No RBAC atual, ele possui leitura e escrita dos recursos comerciais, mas não administra a organização, usuários nem auditoria administrativa.

## O que fazer na configuração rápida

### 1. Revisar empresas

Confira os clientes e contas existentes. Corrija dados comerciais quando necessário e mantenha os registros sem duplicação.

### 2. Revisar contatos

Cadastre contatos, canais de comunicação e vínculos com empresas. Contatos independentes podem ser associados depois.

### 3. Organizar tags

Crie e utilize tags comerciais quando a versão e as permissões disponíveis permitirem essa operação.

### 4. Manter campos customizados

Utilize campos definidos para Empresa ou Contato e garanta que a equipe preencha informações importantes de forma consistente.

### 5. Orientar a equipe

Padronize como os vendedores registram canais, histórico, tags e demais informações comerciais.

## Permissões técnicas atuais

O MANAGER possui:

- `company.read` / `company.write`;
- `contact.read` / `contact.write`;
- `opportunity.read` / `opportunity.write` / `opportunity.move`;
- `activity.read` / `activity.write`;
- `knowledge.read` / `knowledge.write`.

Não possui:

- `organization.manage`;
- `user.manage`;
- `audit.read`.

## Atenção

MANAGER e SELLER possuem atualmente o mesmo conjunto técnico de permissões comerciais. A diferença é de responsabilidade operacional. Uma futura versão poderá refinar essa separação, mas o manual não deve assumir restrições que o backend ainda não aplica.

## Checklist diário sugerido

- [ ] dados de empresas atualizados;
- [ ] contatos e canais corretos;
- [ ] histórico relevante registrado;
- [ ] tags usadas de maneira padronizada;
- [ ] campos obrigatórios de negócio preenchidos;
- [ ] inconsistências encaminhadas ao ADMIN quando envolverem usuários ou organização.
