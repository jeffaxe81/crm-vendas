# Deploy HTTP/HTTPS do CRM-vendas (Nginx + certificados + Docker)

> **Ciclo 12 — prioridade máxima (P0).** Melhoria de produto que torna o deploy em servidor
> reproduzível e elimina a causa do incidente de 2026-10-09 (CRM fora do ar com 502).

## 1. Arquitetura

```
navegador ──https:443──▶ Nginx ──▶ web (Next.js)  127.0.0.1:3000   /
            http:80 ─301─▶        └▶ api (NestJS)  127.0.0.1:3001   /api/
                                        └▶ postgres 127.0.0.1:5432
```

- O Nginx é a **única** porta de entrada (80 redireciona para 443).
- Front e API ficam na **mesma origem** (`https://<host>` e `https://<host>/api/v1`): sem CORS cruzado e sem conteúdo misto.
- 3000, 3001 e 5432 são publicadas apenas em `127.0.0.1` (`BIND_ADDRESS`).
- Certificado emitido por uma **CA própria** (`crm-vendas-rootCA`), com o IP do servidor no SAN.

## 2. Incidente que motivou a mudança (2026-10-09)

| Sintoma                                                     | Causa                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://192.168.40.84` → 502; nada escutando na porta 3000 | O serviço `web` só sobe com a API `healthy`                                                                                                       |
| API `unhealthy`, `/api/v1/health` → 503                     | `password authentication failed for user "axes_app"`                                                                                              |
| Senha do `axes_app` divergente                              | O role era criado **só na primeira inicialização do volume**; mudar `APP_DB_PASSWORD` depois não alterava o banco                                 |
| Agravantes                                                  | `docker-compose.yml` (stack FastAPI) e `compose.yaml` na raiz → aviso de ambiguidade; `.env` possivelmente com CRLF; health sem o motivo da falha |
| Problema latente (aparece após corrigir o 502)              | Bundle do front fixo em `http://localhost:3001/api/v1` → no navegador de outro computador, a API não é encontrada e há conteúdo misto             |

## 3. O que mudou no repositório

| Arquivo                                             | Mudança                                                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml`                                      | Serviço **`db-bootstrap`**: a cada `up`, cria/atualiza o role `axes_app`, ressincroniza a senha e reaplica os GRANTs (depois das migrations). A API depende dele.                                          |
| `compose.yaml`                                      | Superusuário via `POSTGRES_USER/PASSWORD/DB` (padrões iguais aos atuais); portas em `${BIND_ADDRESS:-127.0.0.1}`; `restart: unless-stopped`; `NEXT_PUBLIC_API_BASE_URL` passado como **build arg** do web. |
| `postgres-init/01-create-app-role.sh`               | Idempotente: `CREATE ROLE` se faltar + `ALTER ROLE ... PASSWORD` sempre; remove `\r` da senha; valores passados como variáveis do `psql` (sem quebra com aspas).                                           |
| `apps/web/Dockerfile`                               | `ARG NEXT_PUBLIC_API_BASE_URL` no estágio de build (o Next embute `NEXT_PUBLIC_*` no bundle).                                                                                                              |
| `apps/api/src/health/health.controller.ts`          | Readiness registra no log o erro real do banco; a resposta HTTP continua sem detalhes internos.                                                                                                            |
| `docker-compose.yml` → `docker-compose.fastapi.yml` | Stack FastAPI renomeada; acabou a ambiguidade. Referências atualizadas em `SETUP.md`, `backend/`.                                                                                                          |
| `.gitattributes`                                    | LF obrigatório em `.env*`, `*.sh`, `*.yml/yaml`, `*.conf`, `*.sql`, `Dockerfile`.                                                                                                                          |
| `.gitignore`                                        | `*.key`, `*.srl`, `*.csr` (chaves nunca no Git).                                                                                                                                                           |
| `deploy/nginx/crm-vendas.conf`                      | Modelo do proxy (HTTP→HTTPS, TLS 1.2/1.3, HSTS, cabeçalhos de segurança, `/api/` e `/`, WebSocket).                                                                                                        |
| `deploy/certs/gerar-certificados.sh`                | Emite o certificado do servidor reaproveitando a CA existente; recusa criar CA nova se a chave da CA sumir.                                                                                                |
| `deploy/setup-servidor.sh`                          | Setup idempotente do servidor (pacotes, Apache off, certificado, Nginx com backup/rollback, SELinux, firewall, `.env`, rebuild, verificação).                                                              |
| `scripts/verificar-deploy.sh`                       | Diagnóstico completo (serviços, containers, login do role, portas, HTTP, HTTPS, certificado, bundle do front, exposição). Sai com código 1 se houver falha.                                                |

## 4. Variáveis do `.env` no servidor

```dotenv
POSTGRES_DB=axes_crm
POSTGRES_USER=axes           # mantenha os valores com que o volume foi criado
POSTGRES_PASSWORD=axes
APP_DB_USER=axes_app
APP_DB_PASSWORD=<senha forte, só letras e números>   # pode mudar: o db-bootstrap sincroniza
BIND_ADDRESS=127.0.0.1
WEB_ORIGIN=https://192.168.40.84
NEXT_PUBLIC_API_BASE_URL=https://192.168.40.84/api/v1   # mudou? rebuild do web
JWT_ACCESS_SECRET=<aleatório ≥ 32>
REFRESH_TOKEN_PEPPER=<aleatório ≥ 32>
```

## 5. Aplicar no servidor (após o merge)

```bash
cd /desenv/crm-vendas
# o docker-compose.yml foi renomeado manualmente no incidente; devolve ao estado do Git
[ -f docker-compose.yml.old ] && mv docker-compose.yml.old docker-compose.yml
git stash push -m antes-ciclo12 || true   # guarda ajustes locais em arquivos versionados, se houver
git pull
sudo bash deploy/setup-servidor.sh
```

O setup termina rodando `scripts/verificar-deploy.sh`. Resultado esperado: **0 falha(s)**.
Se houver ajustes locais guardados no `git stash`, revise-os com `git stash show -p`.

**Rollback:** `git checkout <commit-anterior> && docker compose up -d --build`. As configs do Nginx substituídas ficam como `*.bak-<data>` em `/etc/nginx/conf.d/`; o certificado e a CA ficam em `/etc/pki/tls`.

## 6. Certificados

- Renovar ou incluir IP/nome: `sudo SAN_IPS="127.0.0.1 192.168.40.84" SAN_DNS="localhost crm.local" bash deploy/certs/gerar-certificados.sh && sudo systemctl reload nginx`
- A CA é reaproveitada, então os clientes **não** precisam reinstalar nada.
- O diagnóstico avisa 30 dias antes do vencimento.

**Instalar a CA nos computadores clientes** (`/etc/pki/tls/certs/crm-vendas-rootCA.pem`):

| Sistema                    | Comando                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Windows (PowerShell admin) | `certutil -addstore -f Root crm-vendas-rootCA.pem`                                                           |
| RHEL/Rocky/Fedora          | `cp crm-vendas-rootCA.pem /etc/pki/ca-trust/source/anchors/ && update-ca-trust`                              |
| Debian/Ubuntu              | `cp crm-vendas-rootCA.pem /usr/local/share/ca-certificates/crm-vendas-rootCA.crt && update-ca-certificates`  |
| macOS                      | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain crm-vendas-rootCA.pem` |
| Firefox                    | `about:config` → `security.enterprise_roots.enabled = true`                                                  |

## 7. Diagnóstico rápido

| Falha no `verificar-deploy.sh`             | Ação                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Role da aplicação não autentica            | `docker compose up -d db-bootstrap && docker compose restart api`      |
| Health da API ≠ 200                        | `docker compose logs --tail=50 api` (o motivo agora aparece no log)    |
| Front não responde em 3000                 | `docker compose ps -a`; o web espera a API ficar `healthy`             |
| Bundle aponta para `http://localhost:3001` | Ajuste `NEXT_PUBLIC_API_BASE_URL` e `docker compose up -d --build web` |
| HTTPS 502 com containers OK                | `getsebool httpd_can_network_connect` deve estar `on`                  |
| `.env` com CRLF                            | `sed -i 's/\r$//' .env`                                                |

## 8. Critérios de aceite

- [ ] Trocar `APP_DB_PASSWORD` + `docker compose up -d` → stack `healthy` sem `ALTER ROLE` manual.
- [ ] Volume novo → role criado, GRANTs aplicados, stack sobe sem intervenção.
- [ ] `https://192.168.40.84` abre o CRM e o login funciona de outro computador da rede.
- [ ] `http://192.168.40.84` → 301 para HTTPS.
- [ ] 3000, 3001 e 5432 publicadas só em `127.0.0.1`.
- [ ] `docker compose up` sem aviso de múltiplos arquivos de compose.
- [ ] `scripts/verificar-deploy.sh` → 0 falha(s).
- [ ] Nenhuma chave (`*.key`) ou `.env` versionado.
