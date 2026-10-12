# AXE CRM — Release 1.1: primeiro acesso e tour guiado

## Finalidade

Aprimorar a adoção e a configuração inicial sem atrasar nem confundir a
homologação da versão 1.0. Esta branch é uma proposta de **release 1.1**,
não uma versão já implantada ou aprovada para produção.

### Wizard da empresa — apenas primeiro administrador

- A pessoa que registra a empresa é marcada no servidor como responsável pela configuração.
- Em organizações legadas sem responsável, o **administrador ativo mais antigo**
  pode assumir o wizard uma vez, de forma idempotente.
- O assistente exibe quatro etapas com retomada entre sessões: (1) nome da
  empresa (salvo no banco), (2) usuários e perfis, (3) preferências e área
  comercial, (4) integrações e conclusão.
- As etapas 2 a 4 oferecem atalhos às áreas existentes, sem conceder poderes
  novos, instalar integrações ou criar dados sem consentimento do operador.
- O assistente só desaparece definitivamente quando o administrador o conclui.
  Um novo login recupera a etapa salva. Outros administradores não alteram
  o estado sem transferência formal de responsabilidade (futuro recurso).

### Tour — no primeiro acesso **de cada usuário**

- Exibido em cada membership de empresa ao primeiro login, independentemente
  de o usuário ser ADMIN, MANAGER, SELLER ou VIEWER.
- Explica cada seção autorizada do menu conforme
  `availableWorkspaceDestinations(session.permissions)`, abre a tela
  correspondente e permite **Próximo, Voltar, Pular** e **Concluir**.
- Conclusão ou pulo são armazenados no PostgreSQL por empresa/usuário;
  não dependem de localStorage, sessão ou dispositivo.
- A opção **Ajuda · Rever tour** permite repetição manual sem limpar a
  evidência do primeiro acesso.
- Módulos não autorizados não aparecem no tour. O tutorial não concede acesso.
- Credenciais OAuth, envio de e-mails e integrações não são ativados por
  essa experiência.

## Contratos e segurança

- Endpoints protegidos por `AuthenticationGuard`, exigindo sessão de usuário:
  `GET /api/v1/me/onboarding`,
  `PUT /api/v1/me/onboarding/organization`,
  `POST /api/v1/me/onboarding/tour`.
- Os IDs de usuário/empresa vêm exclusivamente da sessão autenticada; corpos
  de escrita são validados por Zod estrito; o primeiro administrador é
  verificado novamente no backend.
- Todas as operações de dados usam transações com tenant RLS.
- A configuração registra eventos de auditoria sem gravar senhas/tokens.
- A migração é aditiva e mantém o isolamento PostgreSQL existente.

## Evidências obrigatórias antes de integrar e publicar

- [ ] CI completo da PR 1.1, com migration deploy, lint, typecheck, testes de
      repositório, API, frontend, E2E, Compose e imagens.
- [ ] Testes reais de dois tenants, usuário vendedor, usuário VIEWER, dois
      administradores na mesma empresa, refresh/relogin, negação de API Key,
      progresso no wizard e tour que não reaparece automaticamente.
- [ ] Revisão de segurança independente e testes de acessibilidade do painel,
      inclusive teclado, foco, leitores de tela e telas pequenas.
- [ ] Planejamento de upgrade do servidor 1.0→1.1, backup restaurável,
      migração sem downtime e rollback adequado.
- [ ] Manifesto da main final e aceite operacional específico da 1.1.

## Observações

A melhoria de primeiro acesso não implica _GO_ da 1.0/1.1. O `DisabledEmailProvider`
permanece ativo até a habilitação homologada por provedores. Não oferecer a
integração externa como concluída dentro do wizard.
