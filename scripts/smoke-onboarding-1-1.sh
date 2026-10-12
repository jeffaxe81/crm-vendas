#!/usr/bin/env bash
# CRM 1.1: smoke HTTPS nao destrutivo, executado de uma maquina da rede.
# Valida status HTTP/TLS, mas nao autentica usuarios nem atesta a UX real.
# Uso: CRM_BASE_URL=https://crm.exemplo CA_CERT=/caminho/ca.pem bash scripts/smoke-onboarding-1-1.sh
set -uo pipefail

base="${CRM_BASE_URL:-}"
ca="${CA_CERT:-}"
if [[ ! "$base" =~ ^https://[^/?#[:space:]@]+/?$ ]]; then
  echo "[FALHA] CRM_BASE_URL deve indicar somente a origem HTTPS, sem credenciais, path ou query" >&2
  exit 2
fi
if [[ -z "$ca" || ! -f "$ca" || ! -r "$ca" ]]; then
  echo "[FALHA] CA_CERT obrigatorio, existente e legivel; nao sera ignorada a confianca TLS" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "[FALHA] curl nao encontrado" >&2
  exit 2
fi
base="${base%/}"
passed=0
failed=0

code() {
  local status
  if status=$(curl -q --silent --show-error --output /dev/null --max-time 12 \
    --proto '=https' --max-redirs 0 --cacert "$ca" \
    --write-out '%{http_code}' "$@" 2>/dev/null); then
    printf '%s' "$status"
  else
    # Um HTTP 200/401 parcial nunca vira PASS se curl retornou erro.
    printf '000'
  fi
}
probe() {
  local label="$1" expected="$2" status
  shift 2
  status=$(code "$@")
  if [[ "$status" == "$expected" ]]; then
    echo "[OK] $label: HTTP $status"
    passed=$((passed + 1))
  else
    echo "[FALHA] $label: HTTP $status (esperado $expected)"
    failed=$((failed + 1))
  fi
}

echo "CRM 1.1 — smoke externo de primeiro acesso (sem credenciais)"
probe "API health com CA confiavel" 200 "$base/api/v1/health"
probe "GET /me/onboarding exige login" 401 \
  --request GET "$base/api/v1/me/onboarding"
probe "PUT /me/onboarding/organization exige login" 401 \
  --request PUT --header 'Content-Type: application/json' --data '{}' \
  "$base/api/v1/me/onboarding/organization"
probe "POST /me/onboarding/tour exige login" 401 \
  --request POST --header 'Content-Type: application/json' --data '{}' \
  "$base/api/v1/me/onboarding/tour"

echo "Resultado: $passed aprovacoes, $failed falha(s)"
echo "LIMITACAO: HTTP 401 isolado nao prova funcionalidade, RLS, login, wizard ou tour; executar roteiro autenticado."
(( failed == 0 ))
