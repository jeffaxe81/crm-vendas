#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
if ! command -v python3 >/dev/null || ! command -v docker >/dev/null; then
  echo "Requer Python 3 e Docker Compose." >&2; exit 1
fi
echo "=== Administração local de Superusuários — CRM ==="
echo "1) Criar/promover Superusuário na empresa"
echo "2) Revogar privilégio de Superusuário"
echo "3) Alterar senha de usuário existente"
read -r -p "Escolha [1-3]: " selection
case "$selection" in
  1) action=grant ;;
  2) action=revoke ;;
  3) action=password ;;
  *) echo "Opção inválida." >&2; exit 2 ;;
esac
read -r -p "Slug da empresa: " organization
read -r -p "E-mail do usuário: " email
name=""
password=""
if [[ "$action" == grant ]]; then
  read -r -p "Nome (obrigatório para novo usuário): " name
  echo "Para usuário existente, deixe a senha vazia para preservá-la."
  read -r -s -p "Senha (mínimo 12 caracteres, se informada): " password
  echo
elif [[ "$action" == password ]]; then
  echo "ATENÇÃO: a senha pertence ao usuário global e poderá afetar seus acessos em outras empresas."
  read -r -s -p "Nova senha (mínimo 12 caracteres): " password
  echo
fi
if [[ -n "$password" ]]; then
  read -r -s -p "Repita a senha: " again
  echo
  if [[ "$password" != "$again" || ${#password} -lt 12 ]]; then
    echo "Senhas divergentes ou com menos de 12 caracteres." >&2; exit 2
  fi
fi
echo "Operação: $action | Empresa: $organization | Usuário: $email"
read -r -p 'Digite CONFIRMAR para executar: ' confirm
if [[ "$confirm" != CONFIRMAR ]]; then echo "Cancelado."; exit 1; fi
# Secrets cross only stdin; never command-line arguments, logs, or repository files.
printf '%s\0' "$action" "$organization" "$email" "$name" "$password" "$confirm" |
  python3 -c 'import json,sys
a=sys.stdin.buffer.read().decode().split("\0")
obj={"action":a[0],"organizationSlug":a[1],"email":a[2],"confirm":a[5]}
if a[3]: obj["displayName"]=a[3]
if a[4]: obj["password"]=a[4]
sys.stdout.write(json.dumps(obj))' |
  docker compose exec -T api node dist/scripts/manage-superuser.js
unset password again
