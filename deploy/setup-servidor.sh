#!/usr/bin/env bash
# CRM-vendas — prepara o servidor (RHEL/Rocky/Alma) para servir o CRM em HTTPS.
#
# Idempotente: pode ser executado quantas vezes for preciso.
#   - Nginx instalado, ativo e no boot; Apache desativado (libera 80/443)
#   - certificado TLS (reaproveita o existente; reemite pela CA própria se faltar)
#   - config do Nginx a partir de deploy/nginx/crm-vendas.conf (com backup e rollback)
#   - SELinux (proxy do Nginx), firewall (http/https), Docker no boot
#   - .env sem CRLF e com WEB_ORIGIN / NEXT_PUBLIC_API_BASE_URL em https://
#   - stack recriada (inclui rebuild do web) e verificação final
#
# Uso (na raiz do repositório, ex.: /desenv/crm-vendas):
#   sudo bash deploy/setup-servidor.sh
#   sudo CRM_IP=192.168.40.84 CRM_HOSTS="192.168.40.84 crm.local localhost" bash deploy/setup-servidor.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ="$(pwd)"

CRM_IP="${CRM_IP:-192.168.40.84}"
CRM_HOSTS="${CRM_HOSTS:-$CRM_IP crm.local localhost}"
NGINX_CONF="/etc/nginx/conf.d/crm-vendas.conf"
CARIMBO="$(date +%Y%m%d%H%M%S)"

passo() { printf '\n>> %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Execute como root (sudo)." >&2; exit 1; }

passo "Pacotes"
dnf install -y -q nginx openssl policycoreutils-python-utils >/dev/null

passo "Apache desativado (libera as portas 80/443)"
systemctl disable --now httpd 2>/dev/null || true

passo "Certificado TLS"
# Reaproveita o certificado já usado por uma config existente do CRM, se houver.
if [[ -z "${CRM_CERT:-}" ]]; then
  existente="$(grep -lE '127\.0\.0\.1:3000|localhost:3000|crm_web' /etc/nginx/conf.d/*.conf 2>/dev/null | head -1 || true)"
  if [[ -n "$existente" ]]; then
    CRM_CERT="$(awk '$1=="ssl_certificate" {gsub(";","",$2); print $2; exit}' "$existente")"
    CRM_KEY="$(awk '$1=="ssl_certificate_key" {gsub(";","",$2); print $2; exit}' "$existente")"
    [[ "$CRM_CERT" == __* ]] && CRM_CERT="" && CRM_KEY=""
  fi
fi
CRM_CERT="${CRM_CERT:-/etc/pki/tls/certs/crm-vendas.crt}"
CRM_KEY="${CRM_KEY:-/etc/pki/tls/private/crm-vendas.key}"
if [[ -f "$CRM_CERT" && -f "$CRM_KEY" ]] &&
  openssl x509 -in "$CRM_CERT" -noout -checkend $((30 * 86400)) >/dev/null &&
  openssl x509 -in "$CRM_CERT" -noout -ext subjectAltName 2>/dev/null | grep -q "IP Address:$CRM_IP"; then
  echo "   mantido: $CRM_CERT"
else
  echo "   ausente, vencendo ou sem o IP $CRM_IP: reemitindo"
  SAN_IPS="127.0.0.1 $CRM_IP" SAN_DNS="localhost crm.local" bash deploy/certs/gerar-certificados.sh
  CRM_CERT=/etc/pki/tls/certs/crm-vendas.crt
  CRM_KEY=/etc/pki/tls/private/crm-vendas.key
fi

passo "Configuração do Nginx"
# Tira de cena outras configs do CRM (evita server_name duplicado) — com backup.
backups=()
for f in $(grep -lE '127\.0\.0\.1:3000|localhost:3000' /etc/nginx/conf.d/*.conf 2>/dev/null || true); do
  [[ "$f" == "$NGINX_CONF" ]] && continue
  mv "$f" "$f.bak-$CARIMBO"
  backups+=("$f")
  echo "   config antiga movida: $f -> $f.bak-$CARIMBO"
done
[[ -f "$NGINX_CONF" ]] && cp -p "$NGINX_CONF" "$NGINX_CONF.bak-$CARIMBO"
sed -e "s#__SERVER_NAMES__#$CRM_HOSTS#g" \
  -e "s#__SSL_CERT__#$CRM_CERT#g" \
  -e "s#__SSL_KEY__#$CRM_KEY#g" \
  deploy/nginx/crm-vendas.conf >"$NGINX_CONF"
chmod 644 "$NGINX_CONF"
restorecon "$NGINX_CONF" 2>/dev/null || true

if ! nginx -t; then
  echo "nginx -t falhou: restaurando a configuração anterior." >&2
  if [[ -f "$NGINX_CONF.bak-$CARIMBO" ]]; then mv "$NGINX_CONF.bak-$CARIMBO" "$NGINX_CONF"; else rm -f "$NGINX_CONF"; fi
  for f in "${backups[@]}"; do mv "$f.bak-$CARIMBO" "$f"; done
  exit 1
fi

passo "SELinux: Nginx pode conectar nas portas 3000/3001"
if command -v setsebool >/dev/null 2>&1 && selinuxenabled 2>/dev/null; then
  setsebool -P httpd_can_network_connect 1
fi

passo "Firewall: HTTP e HTTPS"
if systemctl is-active --quiet firewalld; then
  firewall-cmd -q --permanent --add-service=http --add-service=https
  firewall-cmd -q --reload
fi

passo "Serviços no boot"
systemctl enable --now docker
systemctl enable --now nginx
systemctl reload nginx

passo "Arquivo .env"
[[ -f .env ]] || cp .env.example .env
sed -i 's/\r$//' .env # remove CRLF do Windows
define_env() {
  local chave="$1" valor="$2" atual
  atual="$(grep -E "^$chave=" .env | tail -1 | cut -d= -f2- || true)"
  if [[ -z "$atual" || "$atual" == *localhost* || "$atual" == http://* ]]; then
    if grep -qE "^$chave=" .env; then
      sed -i "s#^$chave=.*#$chave=$valor#" .env
    else
      printf '%s=%s\n' "$chave" "$valor" >>.env
    fi
    echo "   $chave=$valor"
  else
    echo "   $chave mantido ($atual)"
  fi
}
define_env WEB_ORIGIN "https://$CRM_IP"
define_env NEXT_PUBLIC_API_BASE_URL "https://$CRM_IP/api/v1"
grep -qE '^BIND_ADDRESS=' .env || printf 'BIND_ADDRESS=127.0.0.1\n' >>.env
grep -qE '^APP_DB_PASSWORD=.+' .env || { echo "Defina APP_DB_PASSWORD no .env." >&2; exit 1; }

passo "Subindo a stack (rebuild do web para embutir a URL https da API)"
docker compose up -d --build --remove-orphans

passo "Aguardando o front responder em 127.0.0.1:3000"
for _ in $(seq 1 60); do
  curl -s -o /dev/null -m 3 http://127.0.0.1:3000 && break
  sleep 5
done
docker compose ps

passo "Verificação"
bash "$RAIZ/scripts/verificar-deploy.sh"
