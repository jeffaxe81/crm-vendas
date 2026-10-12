# Manual do ADMIN — Release 1.2

## Para quem é

O perfil ADMIN é responsável pela administração da organização no CRM e também possui acesso completo às operações comerciais previstas pelo RBAC atual.

## Configuração rápida recomendada

### 1. Validar a organização

Confirme a organização ativa antes de alterar usuários, tags ou campos customizáveis. O isolamento multiempresa utiliza a organização da sessão; nunca reutilize cadastros de outra empresa.

### 2. Configurar usuários

Revise os usuários e escolha o perfil adequado:

- ADMIN — administração e operação comercial;
- MANAGER — operação comercial com escrita;
- SELLER — operação comercial com escrita;
- VIEWER — consulta.

Evite conceder ADMIN quando a pessoa não precisa administrar organização, usuários ou auditoria.

### 3. Preparar empresas e contatos

Cadastre ou revise as empresas principais e seus contatos. Um contato pode existir sem empresa e ser relacionado posteriormente.

### 4. Criar tags

Use tags para classificações simples e reutilizáveis. Prefira nomes objetivos e evite duplicações com variações de maiúsculas/minúsculas.

### 5. Criar campos customizáveis

Crie somente campos que serão realmente utilizados. Defina corretamente o escopo:

- COMPANY — empresa;
- CONTACT — contato.

Tipos suportados devem seguir a versão instalada do CRM.

### 6. Revisar auditoria

Use a auditoria para investigar alterações administrativas e operações relevantes quando necessário.

## Permissões técnicas

O ADMIN possui:

- `organization.manage`;
- `user.manage`;
- `audit.read`;
- `company.read` / `company.write`;
- `contact.read` / `contact.write`;
- `opportunity.read` / `opportunity.write` / `opportunity.move`;
- `activity.read` / `activity.write`;
- `knowledge.read` / `knowledge.write`.

Alguns módulos listados nas permissões podem depender de ciclos posteriores para aparecer na interface.

## Boas práticas

- mantenha pelo menos uma administração válida para a organização;
- use VIEWER para quem precisa apenas consultar;
- não compartilhe contas;
- revise periodicamente usuários e acessos;
- utilize tags para classificação e campos customizados apenas quando a informação precisa de estrutura própria;
- não tente contornar isolamento multiempresa usando IDs ou URLs de outra organização.

## Checklist de conclusão

- [ ] organização conferida;
- [ ] usuários e perfis revisados;
- [ ] empresas iniciais cadastradas;
- [ ] contatos iniciais cadastrados;
- [ ] tags necessárias criadas;
- [ ] campos customizáveis essenciais criados;
- [ ] equipe orientada com seus respectivos manuais.
