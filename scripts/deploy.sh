#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
BACKUP_DIR="${CRM_BACKUP_DIR:-${HOME:-/tmp}/.local/state/crm-vendas/backups}"
SKIP_BACKUP=0
SKIP_BOOTSTRAP=1
CHECK_ONLY=0
SETUP_SERVER=0
VERIFY_HTTPS=0

usage() {
  cat <<'EOF'
CRM-vendas — implantação/atualização em Linux

Uso:
  ./scripts/deploy.sh [opções]

Opções:
  --env-file ARQUIVO   Arquivo de ambiente (padrão: .env)
  --backup-dir DIR     Diretório de backups SQL
  --no-backup          Pula o pg_dump pré-migration
  --bootstrap-admin    Executa bootstrap do administrador (pode redefinir senha existente)
  --skip-bootstrap     Não executa o bootstrap do administrador (padrão seguro)
  --check-only         Valida host/.env/Compose e não altera serviços
  --setup-server       Executa o setup completo Nginx/HTTPS (Rocky/RHEL/Alma)
  --verify-https       Executa scripts/verificar-deploy.sh ao final
  -h, --help           Mostra esta ajuda

Exemplos:
  ./scripts/deploy.sh --check-only
  ./scripts/deploy.sh
  ./scripts/deploy.sh --bootstrap-admin   # somente inicialização autorizada
  ./scripts/deploy.sh --skip-bootstrap
  CRM_IP=192.168.40.84 ./scripts/deploy.sh --setup-server
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

warn() {
  printf '[deploy][aviso] %s\n' "$*" >&2
}

die() {
  printf '[deploy][erro] %s\n' "$*" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --env-file)
      (($# >= 2)) || die "--env-file exige um caminho."
      ENV_FILE="$2"
      shift 2
      ;;
    --backup-dir)
      (($# >= 2)) || die "--backup-dir exige um caminho."
      BACKUP_DIR="$2"
      shift 2
      ;;
    --no-backup)
      SKIP_BACKUP=1
      shift
      ;;
    --bootstrap-admin)
      SKIP_BOOTSTRAP=0
      shift
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=1
      shift
      ;;
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    --setup-server)
      SETUP_SERVER=1
      shift
      ;;
    --verify-https)
      VERIFY_HTTPS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Opção desconhecida: $1"
      ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "Docker não está instalado."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 não está disponível."

if [[ ! -f "$ENV_FILE" ]]; then
  cp .env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  die "$ENV_FILE foi criado. Configure os valores reais e execute novamente."
fi

if grep -q $'\r' "$ENV_FILE"; then
  die "$ENV_FILE contém CRLF. Corrija com: sed -i 's/\\r$//' '$ENV_FILE'"
fi

chmod 600 "$ENV_FILE" 2>/dev/null || true

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${POSTGRES_DB:?Defina POSTGRES_DB em $ENV_FILE}"
: "${POSTGRES_USER:?Defina POSTGRES_USER em $ENV_FILE}"
: "${POSTGRES_PASSWORD:?Defina POSTGRES_PASSWORD em $ENV_FILE}"
: "${APP_DB_USER:?Defina APP_DB_USER em $ENV_FILE}"
: "${APP_DB_PASSWORD:?Defina APP_DB_PASSWORD em $ENV_FILE}"
: "${JWT_ACCESS_SECRET:?Defina JWT_ACCESS_SECRET em $ENV_FILE}"
: "${REFRESH_TOKEN_PEPPER:?Defina REFRESH_TOKEN_PEPPER em $ENV_FILE}"
: "${WEB_ORIGIN:?Defina WEB_ORIGIN em $ENV_FILE}"
: "${NEXT_PUBLIC_API_BASE_URL:?Defina NEXT_PUBLIC_API_BASE_URL em $ENV_FILE}"

[[ "$APP_DB_PASSWORD" != "change-me" ]] || die "Troque APP_DB_PASSWORD=change-me antes de implantar."
[[ "$JWT_ACCESS_SECRET" != local-only-* ]] || die "Substitua JWT_ACCESS_SECRET de desenvolvimento."
[[ "$REFRESH_TOKEN_PEPPER" != local-only-* ]] || die "Substitua REFRESH_TOKEN_PEPPER de desenvolvimento."

if [[ "$POSTGRES_PASSWORD" == "axes" ]]; then
  warn "POSTGRES_PASSWORD ainda usa o valor histórico 'axes'."
  warn "Em volume existente, não altere sem planejar a rotação; em instalação nova, prefira senha forte."
fi

if [[ "$SKIP_BOOTSTRAP" -eq 0 ]]; then
  warn "Bootstrap autorizado explicitamente: o script pode redefinir a senha de um usuário existente."
  : "${BOOTSTRAP_ORG_NAME:?Defina BOOTSTRAP_ORG_NAME em $ENV_FILE}"
  : "${BOOTSTRAP_ORG_SLUG:?Defina BOOTSTRAP_ORG_SLUG em $ENV_FILE}"
  : "${BOOTSTRAP_ADMIN_EMAIL:?Defina BOOTSTRAP_ADMIN_EMAIL em $ENV_FILE}"
  : "${BOOTSTRAP_ADMIN_NAME:?Defina BOOTSTRAP_ADMIN_NAME em $ENV_FILE}"
  : "${BOOTSTRAP_ADMIN_PASSWORD:?Defina BOOTSTRAP_ADMIN_PASSWORD em $ENV_FILE ou use --skip-bootstrap}"
fi

if [[ "$SETUP_SERVER" -eq 1 ]]; then
  [[ "$ENV_FILE" == ".env" ]] || die "--setup-server usa deploy/setup-servidor.sh e requer --env-file .env."
  [[ "$SKIP_BACKUP" -eq 0 ]] || die "--setup-server não permite --no-backup."
  [[ -f deploy/setup-servidor.sh ]] || die "deploy/setup-servidor.sh não encontrado."
fi

COMPOSE=(docker compose --env-file "$ENV_FILE")

log "Validando Docker Compose..."
"${COMPOSE[@]}" config --quiet

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  log "Pré-validação concluída; nenhum serviço foi alterado."
  exit 0
fi

log "Subindo somente o PostgreSQL antes da atualização..."
"${COMPOSE[@]}" up -d --wait postgres

if [[ "$SKIP_BACKUP" -eq 0 ]]; then
  mkdir -p "$BACKUP_DIR"
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="$BACKUP_DIR/${POSTGRES_DB}-${timestamp}.sql"
  backup_tmp="${backup_file}.tmp"

  log "Gerando pg_dump pré-migration: $backup_file"
  "${COMPOSE[@]}" exec -T postgres     pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" >"$backup_tmp"
  mv "$backup_tmp" "$backup_file"
fi

if [[ "$SETUP_SERVER" -eq 1 ]]; then
  log "Backup pré-migration concluído; executando preparação completa do servidor com Nginx/HTTPS..."
  exec sudo -E bash deploy/setup-servidor.sh
fi

log "Construindo e atualizando a stack..."
log "As migrations e o db-bootstrap são gates do compose.yaml antes da API."
"${COMPOSE[@]}" up -d --build --remove-orphans --wait

if [[ "$SKIP_BOOTSTRAP" -eq 0 ]]; then
  log "Executando bootstrap idempotente da organização/admin..."
  "${COMPOSE[@]}" run --rm --no-deps     -e BOOTSTRAP_ORG_NAME     -e BOOTSTRAP_ORG_SLUG     -e BOOTSTRAP_ADMIN_EMAIL     -e BOOTSTRAP_ADMIN_NAME     -e BOOTSTRAP_ADMIN_PASSWORD     api node dist/scripts/bootstrap-admin.js
fi

api_health="http://127.0.0.1:3001/api/v1/health"
web_health="http://127.0.0.1:3000"

if command -v curl >/dev/null 2>&1; then
  log "Validando API: $api_health"
  curl --fail --silent --show-error     --retry 10 --retry-delay 2 --retry-connrefused     "$api_health" >/dev/null

  log "Validando Web: $web_health"
  curl --fail --silent --show-error     --retry 10 --retry-delay 2 --retry-connrefused     "$web_health" >/dev/null
else
  warn "curl não encontrado; os health checks do Docker Compose ainda foram exigidos por --wait."
fi

"${COMPOSE[@]}" ps -a

if [[ "$VERIFY_HTTPS" -eq 1 ]]; then
  log "Executando verificação completa Nginx/HTTPS..."
  sudo -E bash scripts/verificar-deploy.sh
fi

log "Implantação concluída."
log "WEB_ORIGIN=$WEB_ORIGIN"
log "NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL"
