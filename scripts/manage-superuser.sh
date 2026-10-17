#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
if ! command -v python3 >/dev/null || ! command -v docker >/dev/null; then
  echo "Requer Python 3 e Docker Compose." >&2
  exit 1
fi

while true; do
  echo
  echo "=== Administração local de Superusuários — CRM ==="
  echo "1) Listar usuários de TODOS os tenants"
  echo "2) Listar usuários de uma empresa"
  echo "3) Criar ou promover Superusuário em uma empresa"
  echo "4) Revogar privilégio de Superusuário"
  echo "5) Alterar senha de usuário existente"
  echo "6) Sair"
  read -r -p "Escolha [1-6]: " selection
  case "$selection" in
    1) action=list-all ;;
    2) action=list ;;
    3) action=grant ;;
    4) action=revoke ;;
    5) action=password ;;
    6) exit 0 ;;
    *) echo "Opção inválida." >&2; continue ;;
  esac

  organization=""
  if [[ "$action" != list-all ]]; then
    read -r -p "Slug da empresa/tenant: " organization
  fi
  email=""
  if [[ "$action" != list && "$action" != list-all ]]; then
    read -r -p "E-mail do usuário: " email
  fi

  name=""
  password=""
  organizationName=""
  createOrganization="false"
  if [[ "$action" == grant ]]; then
    read -r -p "Se a empresa não existir, deseja criá-la? [s/N]: " createAnswer
    case "$createAnswer" in
      s|S|sim|SIM|Sim)
        createOrganization="true"
        read -r -p "Nome da empresa que será criada: " organizationName
        if [[ -z "${organizationName//[[:space:]]/}" ]]; then
          echo "O nome da nova empresa é obrigatório." >&2
          continue
        fi
        ;;
      ""|n|N|nao|não|NAO|NÃO) ;;
      *) echo "Opção inválida." >&2; continue ;;
    esac
    echo "Para promover um usuário existente, informe o e-mail e deixe nome e senha vazios."
    echo "Para criar um usuário novo, informe nome e uma senha de no mínimo 12 caracteres."
    read -r -p "Nome (somente para novo usuário): " name
    read -r -s -p "Senha (somente para novo usuário): " password
    echo
  elif [[ "$action" == password ]]; then
    echo "ATENÇÃO: a senha é global e poderá afetar o acesso a outras empresas."
    read -r -s -p "Nova senha (mínimo 12 caracteres): " password
    echo
    if [[ -z "$password" ]]; then
      echo "Informe uma senha válida." >&2
      continue
    fi
  fi

  if [[ -n "$password" ]]; then
    read -r -s -p "Repita a senha: " repeat
    echo
    if [[ "$password" != "$repeat" || ${#password} -lt 12 ]]; then
      echo "Senhas divergentes ou com menos de 12 caracteres." >&2
      unset repeat
      continue
    fi
    unset repeat
  fi

  confirm=""
  if [[ "$action" != list && "$action" != list-all ]]; then
    echo "Operação: $action | Empresa: $organization | Usuário: $email"
    if [[ "$createOrganization" == true ]]; then
      echo "Se a empresa não existir, será criada como: $organizationName"
    fi
    read -r -p 'Digite CONFIRMAR para executar: ' confirm
    if [[ "$confirm" != CONFIRMAR ]]; then
      echo "Cancelado."
      continue
    fi
  fi

  # O segredo viaja somente por stdin, sem argumentos, arquivos ou logs.
  printf '%s\0' "$action" "$organization" "$email" "$name" "$password" "$confirm" "$organizationName" "$createOrganization" |
    python3 -c 'import json,sys
a=sys.stdin.buffer.read().decode().split("\0")
obj={"action":a[0]}
if a[1]: obj["organizationSlug"]=a[1]
if a[2]: obj["email"]=a[2]
if a[3]: obj["displayName"]=a[3]
if a[4]: obj["password"]=a[4]
if a[5]: obj["confirm"]=a[5]
if a[7]=="true":
    obj["createOrganization"]=True
    obj["organizationName"]=a[6]
sys.stdout.write(json.dumps(obj))' |
    docker compose exec -T api node dist/scripts/manage-superuser.js

  password=""
  if [[ "$action" == list-all ]]; then
    echo "Use o slug e o e-mail exibidos para promover um usuário na opção 3."
  fi
done
