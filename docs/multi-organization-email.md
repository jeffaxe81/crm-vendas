# Acesso da mesma conta a várias empresas

O CRM mantém uma identidade por e-mail normalizado e um vínculo por empresa.
A mesma conta pode participar de várias empresas, com papéis e situação de acesso
independentes. O vínculo nunca copia permissões ou privilégios de outra empresa.

- Ao cadastrar outra empresa, informe o mesmo e-mail e a senha atual da conta.
  A senha é validada antes de criar a empresa. Nome e senha existentes são preservados.
- Em Usuários e perfis, o administrador pode vincular um e-mail existente à sua
  empresa. A senha inicial e o nome informados só são usados para contas novas.
  O administrador não altera as credenciais da identidade existente.
- Um e-mail já vinculado à mesma empresa continua retornando conflito, inclusive
  se o vínculo está inativo. Reative o vínculo existente pela administração.
- No login, informe o identificador da empresa (`organization.slug`) quando houver
  mais de um vínculo ativo. Nenhuma empresa é escolhida silenciosamente.
  Com apenas um vínculo ativo, o identificador continua opcional.
- O login valida a senha e o estado da conta antes de verificar a empresa.
  Empresas e vínculos inativos não autorizam login.

Não há alteração do esquema nem migração de dados nesta correção. A unicidade
existente do e-mail identifica a conta; a unicidade de empresa + usuário evita
vínculos repetidos. As sessões e a auditoria continuam vinculadas à empresa.

Para atualizar uma instalação após integrar a correção:

```bash
cd /desenv/crm-vendas && git pull --ff-only && sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose --progress plain build && sudo docker compose up -d
```
