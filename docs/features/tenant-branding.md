# Identidade visual por empresa — primeira entrega

Administradores com `organization.manage` podem abrir **Administração → Preferências pessoais → Identidade visual da empresa** para enviar um logo PNG/JPEG de até 64 KB, selecionar a cor principal e a cor de fundo do menu, conferir a prévia e salvar. A restauração do padrão também exige salvar. Demais usuários recebem a identidade salva, mas não podem alterá-la.

O logo aparece no menu e no login lembrado pelo navegador. A cor principal é aplicada aos controles que usam a cor principal do CRM; a cor do menu altera sua superfície. Textos e estados de navegação recebem contraste automático. Não há editor de CSS, temas de layout ou alteração de domínio nesta entrega.

As configurações pertencem à empresa e são gravadas no servidor. `GET/PUT /api/v1/organization/branding` usa exclusivamente a empresa autenticada; campos de identidade enviados no corpo são rejeitados. Alterações são auditadas na mesma transação. A configuração não contém credenciais e não altera autorização, seleção de empresa ou permissões.

No primeiro acesso do navegador, o login usa o padrão. Após uma sessão carregar o perfil da empresa, o navegador lembra apenas o identificador interno e o visual para os próximos acessos e após sair. Ao entrar em outra empresa, a identidade é atualizada. Essa preferência não é usada para decidir em qual empresa autenticar. Navegação privada, limpeza ou bloqueio de armazenamento podem restaurar o padrão. Outros navegadores recebem o perfil depois do login. Alterações de outros administradores são atualizadas no próximo login/carregamento, sem sincronização em tempo real.

## Implantação

É necessária a migration `20261016033000_tenant_branding`, que acrescenta a coluna opcional JSONB `organizations.branding`. Empresas existentes continuam com o padrão. Permanecem as políticas RLS da tabela de organizações. Não há migração de dados nem exclusão de registros.

Use o procedimento de atualização do ambiente, incluindo `pnpm --filter @axes/api prisma:migrate:deploy` no container/ambiente apropriado antes de iniciar a nova API. O pipeline gera o Prisma Client e os metadados de backup a partir do schema. Não aplique o schema com `db push` em produção.

## Verificações

- Contratos: formato de cores, logo raster e rejeição de SVG/URLs/identidade injetada.
- API: padrão, gravação/leitura por empresa, administrador e permissões, sessão de usuário e auditoria.
- Integração HTTP/PostgreSQL: persistência após login, isolamento entre empresas, leitura por membro e rejeição de gravação não autorizada.
- Frontend: prévia, upload/remoção, restauração, erros, cache visual e descarte de respostas de GET/PUT após troca de sessão.

A homologação da instalação real deve confirmar o upload, cores do menu, logout e novo acesso no mesmo navegador, alternância entre duas empresas e acesso por um usuário sem permissão de edição.
