#!/usr/bin/env bash
# Verificacao nao destrutiva do bundle Next.js servido pelo container web.
# Imprime CLEAN ou UNSAFE somente apos inspecao completa e bem-sucedida.
set -uo pipefail

result=$(docker compose exec -T web sh -c '
  [ -d .next/static ] && [ -r .next/static ] || exit 2
  grep -rlq "http://localhost:3001" .next/static
  case "$?" in
    0) printf "UNSAFE\n" ;;
    1) printf "CLEAN\n" ;;
    *) exit 2 ;;
  esac
' 2>/dev/null) || exit 1

case "$result" in
  CLEAN|UNSAFE) printf '%s\n' "$result" ;;
  *) exit 1 ;;
esac
