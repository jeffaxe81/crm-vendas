# Ciclo 12 — Homologação pós-merge (C12-02)

## Escopo e evidência

A entrada dos PRs #107 (deploy HTTPS) e #108 (iframe NEO) na `main` não prova implantação.
Este checklist distingue CI, smoke externo, ensaio autenticado e validação da operação NEO.

## 1. HTTPS no servidor de testes

Em máquina da mesma rede que 192.168.40.84:

```bash
CRM_BASE_URL=https://192.168.40.84 \
CRM_HTTP_URL=http://192.168.40.84 \
CA_CERT=/caminho/ca-confiavel.pem \
bash scripts/smoke-externo-c12.sh
```

O script somente faz requisições HTTP(S) de leitura. Sem `CA_CERT`, testa a resposta
funcional com `--insecure` e aponta explicitamente que confiança TLS não foi validada.
O redirecionamento HTTP deve ser 301/308 para HTTPS, o front deve responder 200,
`/api/v1/health` deve responder 200 e os cabeçalhos de segurança devem estar presentes.

No servidor, após revisão de ambiente e cópias de segurança, executar
`sudo bash scripts/verificar-deploy.sh` e anexar o resumo. O script verifica
containers, role restrito, portas, Nginx, certificados e o bundle web.

## 2. API e autenticação

- [ ] Saúde da API retorna HTTP 200; não há 502/503 no navegador
- [ ] Login com conta de testes funciona e restaura sessão ao recarregar
- [ ] Logout remove a sessão e impede acesso não autenticado
- [ ] URLs da API usadas no browser apontam para a mesma origem HTTPS
- [ ] Falha da API aparece como mensagem sem bloquear a interface integralmente

Não registrar senhas, tokens ou cookies nas evidências.

## 3. Comunicação NEO

- [ ] Administrador autorizado salva URL HTTPS, modo e dimensões da organização
- [ ] Usuário sem `integration.manage` não consegue alterar a configuração
- [ ] Outra organização não lê nem altera configurações da primeira
- [ ] Abertura em nova aba funciona, independentemente de `frame-ancestors`
- [ ] Em modo iframe, resposta do NEO autoriza a origem real do CRM
- [ ] Login, áudio, microfone e atendimento são testados no navegador
- [ ] Painel minimizado/expandido mantém o mesmo iframe na navegação
- [ ] Mensagens `postMessage` de outra origem/janela são ignoradas
- [ ] Indisponibilidade do NEO não torna o CRM inutilizável

## 4. Regressão comercial e administrativa

Executar o gate do repositório com banco isolado e variáveis adequadas:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm test:e2e
```

Os fluxos a revisar incluem empresas, contatos, oportunidades, agenda,
importações CSV, produtos, relatórios, chamados, SLA, usuários e integrações.
Registrar SHA, link do job e prints de falhas. O gate inclui lint, typecheck,
testes e build, mas a validação de produto com navegador real é complementar.

## 5. Defeitos e decisão de release

Abrir PR isolado para defeitos reproduzíveis, contendo cenário, evidência,
correção, teste de regressão e resultado do CI. Para aprovar o deploy, exigir:
CI verde, smoke HTTPS e API sem falhas, testes de isolamento multi-tenant e
registro da homologação NEO. Não marcar como aprovado apenas porque o merge ocorreu.

### Estado em 09/10/2026

- PR #107: CI verde antes do merge; merge realizado.
- PR #108: mesclado apesar de CI de formatação falho.
- Smoke remoto do IP privado, login real, áudio NEO e E2E pós-merge: sem evidência de execução.
