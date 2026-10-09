#!/usr/bin/env bash
# CRM-vendas — verificação do deploy HTTP/HTTPS (Nginx + certificado + Docker).
#
# Uso (na raiz do repositório):
#   sudo bash scripts/verificar-deploy.sh
#   sudo CRM_IP=192.168.40.84 bash scripts/verificar-deploy.sh
# Sai com código 1 se houver alguma [FALHA].
set -u
cd "$(dirname "$0")/.." || exit 1

IP="${CRM_IP:-192.168.40.84}"
NGINX_CONF="${CRM_NGINX_CONF:-/etc/nginx/conf.d/crm-vendas.conf}"
CA="${CRM_CA:-/etc/pki/tls/certs/crm-vendas-rootCA.pem}"
CERT="${CRM_CERT:-$(awk '$1=="ssl_certificate" {gsub(";","",$2); print $2; exit}' "$NGINX_CONF" 2>/dev/null)}"
CERT="${CERT:-/etc/pki/tls/certs/crm-vendas.crt}"

ok=0
at=0
fa=0
OK() { echo "  [ OK ] $*"; ok=$((ok + 1)); }
AT() { echo "  [ATENÇÃO] $*"; at=$((at + 1)); }
FA() { echo "  [FALHA] $*"; fa=$((fa + 1)); }
code() { curl -sk -o /dev/null -m 5 -w '%{http_code}' "$1"; }
exposta() { ss -tln | awk -v p=":$1\$" '$4 ~ p {print $4}' | grep -qvE '^(127\.0\.0\.1|\[::1\]):'; }

echo "CRM-vendas — verificação em $(date '+%F %T') | IP: $IP"

echo
echo "1. Serviços"
systemctl is-active --quiet nginx && OK "Nginx ativo" || FA "Nginx parado"
systemctl is-enabled --quiet nginx && OK "Nginx inicia no boot" || AT "Nginx não inicia no boot"
systemctl is-active --quiet httpd && FA "Apache ativo (conflito nas portas 80/443)" || OK "Apache desativado"
nginx -t >/dev/null 2>&1 && OK "Configuração do Nginx válida" || FA "nginx -t falhou"
systemctl is-enabled --quiet docker && OK "Docker inicia no boot" || AT "Docker não inicia no boot"

echo
echo "2. Containers e banco"
n=$(ls compose.yaml compose.yml docker-compose.yaml docker-compose.yml 2>/dev/null | wc -l)
[[ $n -eq 1 ]] && OK "Um único arquivo de compose padrão" || AT "$n arquivos de compose padrão (o Docker escolhe um e ignora os outros)"
if [[ -f .env ]]; then
  grep -q $'\r' .env && FA ".env com CRLF do Windows (corrija: sed -i 's/\\r\$//' .env)" || OK ".env sem CRLF"
fi
while read -r svc estado saude; do
  [[ -z "$svc" ]] && continue
  case "$svc" in
    migrate | db-bootstrap)
      [[ "$estado" == "exited" ]] && OK "Tarefa $svc concluída" || AT "Tarefa $svc: $estado"
      ;;
    *)
      if [[ "$estado" == "running" && (-z "$saude" || "$saude" == "healthy") ]]; then
        OK "Container $svc: $estado ${saude}"
      else
        FA "Container $svc: $estado ${saude}"
      fi
      ;;
  esac
done < <(docker compose ps -a --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null)
docker compose exec -T postgres sh -c \
  'PGPASSWORD="$APP_DB_PASSWORD" psql -h 127.0.0.1 -U "$APP_DB_USER" -d "$POSTGRES_DB" -tAc "select 1"' >/dev/null 2>&1 &&
  OK "Role da aplicação autentica no Postgres" ||
  FA "Role da aplicação NÃO autentica no Postgres (rode: docker compose up -d db-bootstrap)"

echo
echo "3. Portas"
ss -tlnp | grep -q ':80 .*nginx' && OK "Porta 80 (HTTP) com o Nginx" || FA "Porta 80 sem o Nginx"
ss -tlnp | grep -q ':443 .*nginx' && OK "Porta 443 (HTTPS) com o Nginx" || FA "Porta 443 sem o Nginx"
c=$(code http://127.0.0.1:3000)
[[ $c =~ ^[23] ]] && OK "Front responde em 127.0.0.1:3000 ($c)" || FA "Front não responde em 127.0.0.1:3000 ($c)"
c=$(code http://127.0.0.1:3001/api/v1/health)
[[ $c == 200 ]] && OK "API saudável em 127.0.0.1:3001 ($c)" || FA "Health da API: $c (veja: docker compose logs --tail=50 api)"

echo
echo "4. HTTP"
for u in http://127.0.0.1 "http://$IP"; do
  c=$(code "$u")
  [[ $c == 301 || $c == 308 ]] && OK "$u redireciona para https ($c)" || FA "$u não redireciona ($c)"
done

echo
echo "5. HTTPS"
for u in https://127.0.0.1 "https://$IP" "https://$IP/api/v1/health"; do
  c=$(code "$u")
  [[ $c =~ ^[23] ]] && OK "$u responde ($c)" || FA "$u falhou ($c)"
done
if [[ -f "$CA" ]]; then
  curl -s -o /dev/null -m 5 --cacert "$CA" "https://$IP" && OK "Certificado validado pela CA" || FA "Certificado não valida com a CA $CA"
fi
p=$(echo | openssl s_client -connect 127.0.0.1:443 2>/dev/null | awk '/Protocol *:/ {print $3; exit}')
[[ $p == TLSv1.3 || $p == TLSv1.2 ]] && OK "Protocolo negociado: $p" || FA "Protocolo: ${p:-nenhum}"
curl -skI -m 5 https://127.0.0.1 | grep -qi '^strict-transport-security' && OK "Cabeçalho HSTS presente" || AT "HSTS ausente"

echo
echo "6. Certificado"
if [[ -f "$CERT" ]]; then
  fim=$(openssl x509 -in "$CERT" -noout -enddate | cut -d= -f2)
  dias=$((($(date -d "$fim" +%s) - $(date +%s)) / 86400))
  if openssl x509 -in "$CERT" -noout -checkend $((30 * 86400)) >/dev/null; then
    OK "Válido por mais $dias dias ($fim)"
  else
    AT "Vence em $dias dias — renove com deploy/certs/gerar-certificados.sh"
  fi
  openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -q "IP Address:$IP" &&
    OK "IP $IP incluído no certificado" || FA "IP $IP fora do certificado"
else
  FA "Certificado não encontrado: $CERT"
fi
[[ -f "$CA" ]] && OK "CA para os clientes: $CA" || AT "CA não encontrada: $CA"

echo
echo "7. Front em HTTPS (sem conteúdo misto)"
api_url=$(docker compose exec -T web printenv NEXT_PUBLIC_API_BASE_URL 2>/dev/null | tr -d '\r')
[[ $api_url == https://* ]] && OK "NEXT_PUBLIC_API_BASE_URL=$api_url" || FA "NEXT_PUBLIC_API_BASE_URL=${api_url:-vazio} (use https://$IP/api/v1 e rebuild do web)"
if docker compose exec -T web sh -c 'grep -rlq "http://localhost:3001" .next/static 2>/dev/null'; then
  FA "Bundle do front ainda aponta para http://localhost:3001 (rode: docker compose up -d --build web)"
else
  OK "Bundle do front sem http://localhost:3001"
fi
origin=$(docker compose exec -T api printenv WEB_ORIGIN 2>/dev/null | tr -d '\r')
[[ $origin == https://* ]] && OK "WEB_ORIGIN=$origin" || FA "WEB_ORIGIN=${origin:-vazio} (use https://$IP)"

echo
echo "8. Exposição na rede"
if systemctl is-active --quiet firewalld; then
  firewall-cmd -q --query-service=http && OK "Firewall libera HTTP" || FA "Firewall bloqueia HTTP"
  firewall-cmd -q --query-service=https && OK "Firewall libera HTTPS" || FA "Firewall bloqueia HTTPS"
fi
for porta in 3000 3001 5432; do
  exposta "$porta" && FA "Porta $porta exposta na rede (use BIND_ADDRESS=127.0.0.1)" || OK "Porta $porta só local (ou fechada)"
done
if command -v getsebool >/dev/null 2>&1 && selinuxenabled 2>/dev/null; then
  [[ $(getsebool httpd_can_network_connect) == *on ]] && OK "SELinux permite o proxy do Nginx" ||
    FA "SELinux bloqueia o proxy (rode: setsebool -P httpd_can_network_connect 1)"
fi

echo
echo "Resumo: $ok OK | $at atenção | $fa falha(s)"
exit $((fa > 0))
