# AXE CRM 1.1 — Roteiro de homologação do primeiro acesso

**Referência de código:** o primeiro merge 1.1 ocorreu no commit
`e53289c6128f417995ebf49d5139dbb8a337ccd7` da `main`.
O CI [#38277499378](https://github.com/jeffaxe81/crm-vendas/actions/runs/38277499378)
foi aprovado, com manifesto de origem. Commits posteriores exigem nova verificação
do SHA e do CI. **CI não significa deploy ou aceite no servidor.**

## 1. Antes de instalar ou executar alterações

- Identifique o servidor e o responsável autorizado. Não altere produção sem
  autorização, backup verificado e rollback documentado.
- Registre o SHA **instalado** com `git rev-parse HEAD` e compare-o ao SHA da
  execução `push/main` cujo CI e manifesto foram aprovados.
- Para um upgrade 1.0 → 1.1, planeje a migração aditiva do PostgreSQL:
  `organizations.onboarding_owner_id`, `onboarding_step`,
  `onboarding_completed_at`; `organization_memberships.tour_status`.
  Faça antes backup consistente e restaure uma cópia **isolada** para comprovar
  integridade e reversão. Não restaure diretamente sobre dados de produção.
- Nunca compartilhe `.env`, senhas, tokens, chaves privadas de CA ou dumps
  reais como evidência. Evite mudanças de DNS, firewall, certificados, banco ou
  serviços durante a mera fase de coleta.

## 2. Diagnóstico no host autorizado — leitura e verificação

Na raiz do repositório do **servidor já instalado**, execute:

```bash
git rev-parse HEAD
sudo CRM_IP=192.168.40.84 bash scripts/verificar-deploy.sh
```

O segundo comando verifica Nginx, Docker, role PostgreSQL, portas, redirecionamentos,
HTTPS com CA, certificado e bundle Web. **Critério: 0 falhas.** Ele não implanta
a versão, não atesta login nem comprova restauração.

Em uma **outra máquina da mesma rede**, com a CA pública legítima disponibilizada
pelo administrador (não a chave privada), execute:

```bash
export CRM_BASE_URL=https://192.168.40.84
export CRM_HTTP_URL=http://192.168.40.84
export CA_CERT=/caminho/confiavel/crm-vendas-rootCA.pem
bash scripts/smoke-externo-c12.sh
bash scripts/smoke-onboarding-1-1.sh
```

A segunda verificação é propositalmente **não autenticada e não destrutiva**:
o health deve retornar HTTP 200 e os três endpoints de onboarding devem exigir
sessão com HTTP 401. Um 401, isoladamente, **não prova que a rota existe**,
pois um gateway pode responder 401 a todas as rotas. Nunca utilize `-k` ou
`--insecure`; uma CA inválida, rota ausente ou transferência incompleta deve falhar.

## 3. Evidências autenticadas e funcionais (testar na interface)

Em um ambiente de homologação com usuários de teste, sem utilizar dados reais:

1. **Novo tenant A:** registre uma empresa e entre como seu primeiro ADMIN.
   Confirme que surge o wizard de quatro etapas, com progresso retomado após
   logout/login. A alteração do nome deve persistir.
2. **ADMIN adicional:** confirme que não pode alterar o wizard reservado
   ao fundador; a API deve negar alterações não autorizadas.
3. **Conclusão:** finalize o wizard e inicie o tour. Avance e volte; as seções
   apresentadas devem corresponder apenas às permissões do perfil.
4. **Demais usuários:** crie um SELLER e um VIEWER de teste. No primeiro login
   de cada um, o tour deve aparecer individualmente. Salve a conclusão para um
   usuário e o pulo para o outro; após novo login, o tour não deve reaparecer
   automaticamente. A opção **Ajuda · Rever tour** deve continuar disponível.
5. **Tenant B:** crie empresa e usuários diferentes. Verifique que o progresso
   do tenant A não é acessível ou modificável por usuários do B (API e UI).
   Teste também chamadas com API Key para confirmar que o recurso exige sessão.
6. **Regressão comercial:** realize login/logout, cadastro de empresa, contato,
   oportunidade e atividade, mudança de etapa do funil, recarga da página e
   persistência. Nenhum wizard/tour deve impedir cliques nas telas após
   conclusão ou pulo.
7. **Dados e segurança:** verifique permissões, auditoria de mudança do wizard,
   conexões HTTPS, ausência de `http://localhost:3001` no bundle, portas
   3000/3001/5432 sem exposição externa, e que envio externo de e-mails continua
   desabilitado.

Registrar apenas **PASS, FALHA ou NÃO EXECUTADO** por cenário, data, operador,
SHA instalado, ambiente, evidência não sensível e eventual issue de correção.

## 4. Go/No-Go e rollback

- **GO para testes controlados:** CI `push/main` verde no SHA escolhido,
  manifesto correspondente, backup restaurável em ambiente isolado,
  migração de dados ensaiada e autorização do operador para instalar/testar.
- **GO operacional:** somente depois de diagnóstico TLS/host, testes
  autenticados, RLS multiempresa, restauração, rollback ensaiado e aceite
  operacional registrado.
- **NO-GO:** qualquer falha de confiança TLS, login, persistência, isolamento,
  restauração ou perda de acesso deve bloquear liberação. A dispensa de
  revisão independente é uma decisão de governança e **não dispensa** esses
  controles técnicos.
- **Rollback planejado:** registrar o commit de origem e a compatibilidade do
  schema **antes** de migrar; restauração do banco apenas conforme procedimento
  aprovado. O rollback de código não equivale a rollback de dados.

O envio de e-mails por provedores externos, a incorporação de iframe de
terceiros e uma publicação pública têm critérios de homologação próprios.
