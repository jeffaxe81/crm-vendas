# CRM-Vendas — corte acelerado / Go-No-Go (11/10/2026)

## Objetivo

Entregar **o CRM comercial integrado à main** como **preview interno**
sem condicionar a liberação aos novos provedores OAuth. A antecipação
de quatro semanas em relação à meta 25/10 cai em 27/09 (data passada):
não registrar entrega retroativa. O alvo operacional é avaliar um corte
**imediato** a partir de evidências de 11/10, não declarar uma produção pronta.

## Baseline observado — ainda não é release

- `main`: `8866d00c8738419c0412b23ca8d7f4683d372498`.
- CI da `main`: [run 38144496211](https://github.com/jeffaxe81/crm-vendas/actions/runs/38144496211), **success** (11/10/2026).
- OAuth: #140, #141, #143 e #144 **fora da main**, revisão/CI aplicáveis ainda pendentes.
- `EmailModule` segue com `DisabledEmailProvider`: **sem envio externo de e-mail**.
- Não foi anexada a este checkpoint prova da saúde **do servidor instalado**, TLS confiável,
  login/persistência real, backup restaurado ou aprovação operacional.
- **Decisão no checkpoint**: código principal com CI verde; **produção NÃO HOMOLOGADA**.

## Escopo para preview interno

Inclui as funcionalidades comerciais presentes na `main`: organizações,
empresas, contatos, atividades, oportunidades/funil e interfaces já integradas.
A lista não equivale a teste funcional do servidor; a evidência de homologação
deve ser capturada no ambiente instalado.

**Exclui**: envio OAuth Gmail/Outlook, incoming e-mail, WhatsApp, CTI, ERP,
customizações novas, white-label, alterações destrutivas e envio externo.
O iframe NEO só pode ser descrito como embutido quando o provedor externo
permitir `frame-ancestors`; abertura em aba continua alternativa.

## Portões de liberação (todos obrigatórios)

- **Código congelado:** `git rev-parse HEAD` — SHA anotado e igual ao candidato validado.
- **CI:** GitHub Actions no SHA final — formatação, tipos, API, Web, E2E, migrations, Compose e imagens verdes.
- **Preflight de código:** `pnpm release:preflight` — resultado `CODE_CHECKS_PASSED` (não certifica deploy).
- **Servidor:** `sudo bash scripts/verificar-deploy.sh` — zero falhas no ambiente de destino, sem ocultar avisos.
- **Rede e TLS:** `CRM_BASE_URL=https://<host> CA_CERT=/caminho/ca.pem bash scripts/smoke-externo-c12.sh` — zero falhas com confiança TLS efetivamente validada.
- **Operação:** login real e criação/edição de empresa, contato, atividade e oportunidade — estado persiste após nova sessão.
- **Dados:** backup recente, restauração testada, migrações seguras e rollback com evidências.
- **Segurança:** revisão independente, confirmação de RLS e aprovação operacional documentada.

**ATENÇÃO:** scripts de diagnóstico são não destrutivos; não realizar
`docker compose down -v`, `DROP SCHEMA`, apagamento de dados ou alteração
direta de produção para acelerar. O certificado com CA própria **precisa ser
validado**, não basta `curl -k`. Se um portão falhar, marcar **NO-GO** e
preservar a versão instalada.

## Execução enxuta

1. Congelar mudanças funcionais do candidato na `main`. Não misturar a
   fila OAuth (#140→#141→#143→#144) nesta liberação mínima.
2. Executar qualidade automatizada no commit candidato. O novo
   `release:preflight` verifica salvaguardas de configuração e retorna
   código diferente de zero para desvios.
3. Em ambiente controlado, executar os dois diagnósticos de deploy
   e HTTPS, depois login e fluxo comercial real; anexar saídas redigidas
   sem credenciais.
4. Validar restore/rollback e obter a revisão responsável. Registrar
   decisão final **GO** (preview interno) ou **NO-GO** (bloqueado).
5. A versão de produção só pode ser nomeada após aceite separado de
   ambiente, operações e segurança. A meta não substitui evidências.

## Situação inicial

**CÓDIGO: CI PASSOU. PREVIEW: PENDENTE. PRODUÇÃO: NÃO HOMOLOGADA.**

Este arquivo é um registro de decisão/auditoria, não uma etiqueta SemVer,
tag de release ou comprovante de instalação.
