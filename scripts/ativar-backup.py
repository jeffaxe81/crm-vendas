#!/usr/bin/env python3
"""Habilita o backup cifrado no Compose sem alterar uma chave existente.

Execute como root: sudo python3 scripts/ativar-backup.py
Não habilita restauração efetiva, ainda indisponível na API.
"""

import base64
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile

BACKUP_DIRECTORY = "/var/lib/axes-crm/backups"
KEYS = ("BACKUP_DIRECTORY", "BACKUP_ENCRYPTION_KEY")
SETTING = re.compile(r"^\s*(?:export\s+)?(BACKUP_DIRECTORY|BACKUP_ENCRYPTION_KEY)\s*=(.*)$")


def read_settings(contents: str) -> dict[str, tuple[int, str]]:
    found: dict[str, tuple[int, str]] = {}
    for index, line in enumerate(contents.splitlines()):
        match = SETTING.match(line)
        if not match:
            continue
        name = match.group(1)
        if name in found:
            raise ValueError(f"{name} aparece mais de uma vez no .env.")
        value = match.group(2).strip()
        if value.startswith(('"', "'")):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError(f"{name} possui aspas inválidas.")
            value = value[1:-1]
        found[name] = (index, value)
    return found


def validate_key(value: str) -> None:
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, base64.binascii.Error):
        raise ValueError("BACKUP_ENCRYPTION_KEY não é base64 canônico.") from None
    if len(decoded) != 32 or base64.b64encode(decoded).decode("ascii") != value:
        raise ValueError("BACKUP_ENCRYPTION_KEY requer exatamente 32 bytes em base64 canônico.")


def check_no_previous_backups() -> None:
    """Não gera nova chave se não for possível excluir a existência de dados cifrados."""
    try:
        running = subprocess.run(
            ["docker", "compose", "ps", "-q", "api"],
            check=True, capture_output=True, text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError("Não foi possível inspecionar o contêiner API.") from error
    if not running.stdout.strip():
        raise RuntimeError(
            "API não está em execução. Inicie-a e tente novamente antes de criar uma chave."
        )

    code = (
        'const fs=require("node:fs");'
        'if(process.env.BACKUP_ENCRYPTION_KEY)process.exit(12);'
        'try{const a=fs.readdirSync("/var/lib/axes-crm/backups");'
        'if(a.length)process.exit(13)}'
        'catch(e){if(e.code!=="ENOENT")process.exit(14)}'
    )
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "api", "node", "-e", code],
        capture_output=True, text=True,
    )
    if result.returncode == 12:
        raise RuntimeError(
            "A API atual possui outra chave. Preserve e recupere essa chave antes de prosseguir."
        )
    if result.returncode == 13:
        raise RuntimeError(
            "Existem arquivos no volume de backup sem chave no .env. "
            "Recupere a chave original para não perder a capacidade de leitura."
        )
    if result.returncode != 0:
        raise RuntimeError(
            "Não foi possível confirmar que o volume de backups está vazio. "
            "Nenhuma chave será gerada."
        )


def configure_env(path: Path, check_existing=check_no_previous_backups) -> bool:
    """Retorna True apenas quando uma chave nova foi gerada."""
    if path.is_symlink() or not path.is_file():
        raise ValueError("Arquivo .env ausente ou não é um arquivo regular.")
    contents = path.read_text(encoding="utf-8")
    if "\r" in contents:
        raise ValueError("O arquivo .env contém quebras CRLF. Corrija antes de prosseguir.")
    found = read_settings(contents)
    directory = found.get("BACKUP_DIRECTORY", (0, ""))[1]
    if directory and directory != BACKUP_DIRECTORY:
        raise ValueError(
            f"BACKUP_DIRECTORY existente é diferente de {BACKUP_DIRECTORY}. "
            "Não foi alterado para proteger backups anteriores."
        )
    key = found.get("BACKUP_ENCRYPTION_KEY", (0, ""))[1]
    new_key = not bool(key)
    if new_key:
        check_existing()
        key = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
    validate_key(key)

    lines = contents.splitlines(keepends=True)
    updates = {"BACKUP_DIRECTORY": BACKUP_DIRECTORY, "BACKUP_ENCRYPTION_KEY": key}
    for name in KEYS:
        if name in found:
            index, old = found[name]
            if old == updates[name]:
                continue
            newline = "\n" if lines[index].endswith("\n") else ""
            lines[index] = f"{name}={updates[name]}{newline}"
        else:
            if lines and not lines[-1].endswith("\n"):
                lines[-1] += "\n"
            lines.append(f"{name}={updates[name]}\n")
    rewritten = "".join(lines)
    if rewritten == contents:
        # A .env existente pode estar excessivamente acessível.
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
        return False

    fd, temp_name = tempfile.mkstemp(prefix=".env.backup-tmp-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(rewritten)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_name, stat.S_IRUSR | stat.S_IWUSR)
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    return new_key


def main() -> int:
    if os.geteuid() != 0:
        print("ERRO: execute com sudo para proteger o arquivo .env.", file=sys.stderr)
        return 1
    root = Path(__file__).resolve().parent.parent
    os.chdir(root)
    try:
        created = configure_env(root / ".env")
    except (OSError, ValueError, RuntimeError) as error:
        print(f"ERRO: {error}", file=sys.stderr)
        return 1
    print("SUCESSO: armazenamento de backup configurado no .env privado (0600).")
    print("Chave nova gerada." if created else "Chave existente preservada.")
    print("IMPORTANTE: guarde cópia segura da chave fora do servidor; não publique no Git.")
    print("A restauração efetiva não está disponível; a prévia de restore permanece habilitada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
