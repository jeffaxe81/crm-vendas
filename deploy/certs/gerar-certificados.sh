#!/usr/bin/env bash
# CRM-vendas — emite o certificado TLS do servidor assinado por uma CA própria.
#
# - Reaproveita a CA existente (crm-vendas-rootCA). Assim os computadores que já
#   confiam nela não precisam reinstalar nada quando o certificado é reemitido.
# - Só cria uma CA nova se NÃO existir nenhuma (primeira instalação).
# - Nunca grava nada no repositório: tudo fica em /etc/pki/tls.
#
# Uso:
#   sudo SAN_IPS="127.0.0.1 192.168.40.84" SAN_DNS="localhost crm.local" \
#        bash deploy/certs/gerar-certificados.sh
set -euo pipefail

NOME="${CRM_CERT_NAME:-crm-vendas}"
DIR_CERTS="${DIR_CERTS:-/etc/pki/tls/certs}"
DIR_KEYS="${DIR_KEYS:-/etc/pki/tls/private}"
DIAS_CA="${DIAS_CA:-3650}"   # 10 anos
DIAS_SRV="${DIAS_SRV:-825}"  # máximo aceito pelos navegadores para certificados de servidor
SAN_DNS="${SAN_DNS:-localhost crm.local}"
SAN_IPS="${SAN_IPS:-127.0.0.1 192.168.40.84}"

CA_KEY="$DIR_KEYS/$NOME-rootCA.key"
CA_CRT="$DIR_CERTS/$NOME-rootCA.pem"
CA_SRL="$DIR_KEYS/$NOME-rootCA.srl"
SRV_KEY="$DIR_KEYS/$NOME.key"
SRV_CRT="$DIR_CERTS/$NOME.crt"

umask 077
mkdir -p "$DIR_CERTS" "$DIR_KEYS"

# 1) CA raiz
if [[ -f "$CA_CRT" && ! -f "$CA_KEY" ]]; then
  echo "ERRO: a CA $CA_CRT existe, mas a chave $CA_KEY não foi encontrada." >&2
  echo "      Não vou criar uma CA nova (todos os clientes teriam de reinstalar)." >&2
  echo "      Copie a chave da CA para $CA_KEY ou informe DIR_KEYS/CRM_CERT_NAME." >&2
  exit 1
fi
if [[ ! -f "$CA_CRT" ]]; then
  echo ">> Nenhuma CA encontrada: criando $CA_CRT"
  openssl genrsa -out "$CA_KEY" 4096
  openssl req -x509 -new -key "$CA_KEY" -sha256 -days "$DIAS_CA" \
    -subj "/CN=$NOME Root CA" -out "$CA_CRT"
else
  echo ">> CA existente reaproveitada: $CA_CRT"
fi

# 2) Nomes e IPs do certificado (SAN)
SAN=""
for d in $SAN_DNS; do SAN+="DNS:$d,"; done
for ip in $SAN_IPS; do SAN+="IP:$ip,"; done
SAN="${SAN%,}"

EXT="$(mktemp)"
CSR="$(mktemp)"
trap 'rm -f "$EXT" "$CSR"' EXIT
cat >"$EXT" <<EOF
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$SAN
EOF

# 3) Chave, CSR e assinatura (backup do certificado anterior, se houver)
[[ -f "$SRV_CRT" ]] && cp -p "$SRV_CRT" "$SRV_CRT.bak-$(date +%Y%m%d%H%M%S)"
[[ -f "$SRV_KEY" ]] && cp -p "$SRV_KEY" "$SRV_KEY.bak-$(date +%Y%m%d%H%M%S)"

echo ">> Emitindo certificado do servidor: $SAN"
openssl req -new -newkey rsa:2048 -nodes -keyout "$SRV_KEY" \
  -subj "/CN=${SAN_DNS%% *}" -out "$CSR"
openssl x509 -req -in "$CSR" -CA "$CA_CRT" -CAkey "$CA_KEY" \
  -CAserial "$CA_SRL" -CAcreateserial -days "$DIAS_SRV" -sha256 \
  -extfile "$EXT" -out "$SRV_CRT"

# 4) Permissões e contexto SELinux
chmod 600 "$CA_KEY" "$SRV_KEY"
chmod 644 "$CA_CRT" "$SRV_CRT"
if command -v restorecon >/dev/null 2>&1; then
  restorecon -R "$DIR_CERTS" "$DIR_KEYS" || true
fi

openssl verify -CAfile "$CA_CRT" "$SRV_CRT"
openssl x509 -in "$SRV_CRT" -noout -subject -enddate -ext subjectAltName
echo ">> Certificado: $SRV_CRT"
echo ">> Chave:       $SRV_KEY"
echo ">> CA (instalar nos clientes): $CA_CRT"
echo ">> Recarregue o Nginx: systemctl reload nginx"
