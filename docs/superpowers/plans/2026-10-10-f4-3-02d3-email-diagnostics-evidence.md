# F4.3-02D3 — painel administrativo de prontidão e evidências

Data: 10/10/2026. Base: PR #122 → #121 → #120 → #119 → #118 → #117.

## Implementado

- Painel **Notificações por e-mail** na área existente de Integrações, visível apenas a sessões com `integration.manage`. Consulta a configuração resumida e o diagnóstico de pré-validação, sem recuperar ou mostrar o segredo.
- Lista de verificações locais e bloqueios do ciclo D2. Nenhum elemento da tela permite alterar `sendingEnabled` ou `activationEligible`, que permanecem falsos.
- Formulário administrativo para registrar referências **opacas** de evidências de idempotência, egress, TLS/DNS ou revisão operacional. Somente letras, números, pontos, hífen e underscore, de 8 a 96 caracteres; não inserir URLs, e-mails, conteúdo, senhas ou dados pessoais.
- API `GET /admin/email/relay-evidence` lista as 50 referências mais recentes do tenant. `POST /admin/email/relay-evidence` inclui uma referência na trilha de auditoria em transação com RLS. Ambos exigem `integration.manage` e associação ADMIN ativa no tenant. A saída de dados é uma projeção estrita do registro de auditoria, sem acesso a payloads arbitrários.
- Cada referência é **`SUBMITTED_UNVERIFIED`**. Uma evidência registrada é apenas uma indicação a verificar, jamais homologação. `EmailRelayReadinessService` não consome referências registradas para promover `NOT_VERIFIED` a `PASS`.
- Testes de API PostgreSQL/RLS cobrem permissão, isolamento, auditoria, entrada inválida e impossibilidade de ativação com evidência.

## Segregação de responsabilidades

Os registros administrativos não comprovam tecnicamente que há deduplicação durável do relay, egress restrito, DNS/TLS protegido, nem que houve aprovação operacional. A conferência efetiva exige evidências externas e revisão independente, antes de qualquer ativação.

A configuração pode estar `PREPARED`, mas o backend ainda registra **`DisabledEmailProvider`**, sem timer nem envio externo. Nenhuma API de aprovação ou modo `ENABLED` foi adicionada.

## Procedimento

1. Acessar CRM → Integrações → Notificações por e-mail com uma conta ADMIN.
2. Consultar configuração e verificação local; interpretar `NOT_VERIFIED` e `BLOCKED` como obstáculos reais.
3. Registrar apenas o identificador opaco de um chamado/artefato externo. O painel exibirá “Registrada, não verificada”.
4. Após auditoria e homologação independente das provas reais, abrir uma nova implementação sujeita a outros gates de ativação.

## Segurança para merge

Esta entrega é empilhada sobre #122 e deve permanecer em **Draft** até CI integral verde e revisão da cadeia. Mesclar apenas na ordem #117 → #118 → #119 → #120 → #121 → #122 → esta PR.
