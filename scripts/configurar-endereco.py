#!/usr/bin/env python3
"""Change public access configuration without changing internal destinations."""
import argparse
import fcntl
import ipaddress
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def settings(address, mode):
    u = urlsplit(address)
    host = u.hostname or ''
    if (u.scheme not in ('http', 'https') or not host or u.username or u.password
            or u.path not in ('', '/') or u.query or u.fragment
            or not re.fullmatch(r'[a-zA-Z0-9.-]+', host)):
        raise ValueError('Use http(s)://IP-ou-dominio, sem caminho ou credenciais (IPv4).')
    if re.fullmatch(r'[0-9.]+', host):
        ipaddress.IPv4Address(host)
    elif len(host) > 253 or any(not re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?', label) for label in host.split('.')):
        raise ValueError('Dominio invalido.')
    port = u.port
    origin = f'{u.scheme}://{host}' + (f':{port}' if port else '')
    if mode == 'direct':
        if u.scheme != 'http' or port not in (None, 3000):
            raise ValueError('Modo direto usa HTTP nas portas 3000 (web) e 3001 (API). HTTPS exige --mode proxy.')
        origin = f'http://{host}:3000'
        api = f'http://{host}:3001/api/v1'
        bind = '127.0.0.1' if host == 'localhost' or host.startswith('127.') else '0.0.0.0'
    else:
        if port not in (None, 80 if u.scheme == 'http' else 443):
            raise ValueError('Proxy usa as portas padrao 80/443.')
        api, bind = origin + '/api/v1', '127.0.0.1'
    return {'WEB_ORIGIN': origin, 'NEXT_PUBLIC_API_BASE_URL': api,
            'WEB_BIND_ADDRESS': bind, 'API_BIND_ADDRESS': bind}


def update_env(text, values):
    lines = [line for line in text.splitlines() if not any(re.match(r'^\s*(?:export\s+)?' + re.escape(k) + r'\s*=', line) for k in values)]
    return '\n'.join(lines + [f'{k}={v}' for k, v in values.items()]) + '\n'


def write_atomic(path, content, mode):
    fd, name = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            out.write(content)
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('address', help='http://127.0.0.1, http://IP ou https://dominio')
    p.add_argument('--mode', choices=('direct', 'proxy'), help='padrao: proxy se config Nginx existente; senao direct')
    p.add_argument('--nginx-conf', type=Path, default=Path('/etc/nginx/conf.d/crm-vendas.conf'))
    p.add_argument('--check-only', action='store_true', help='mostra plano, sem alterar arquivos ou servicos')
    args = p.parse_args()
    mode = args.mode or ('proxy' if args.nginx_conf.exists() else 'direct')
    values = settings(args.address, mode)
    env = ROOT / '.env'
    if not env.is_file():
        raise ValueError('Configure .env com as senhas antes de executar. Nenhuma senha sera gerada ou trocada.')
    nginx_text = None
    if mode == 'proxy':
        if not args.nginx_conf.is_file():
            raise ValueError('Modo proxy exige uma configuracao Nginx existente do CRM (--nginx-conf).')
        nginx_text = args.nginx_conf.read_text()
        host = urlsplit(args.address).hostname
        # Only edit server_name in the dedicated CRM file. Upstreams remain local.
        nginx_text, count = re.subn(r'(?m)^(\s*server_name\s+)[^;]+;', lambda m: m[1] + host + ';', nginx_text)
        if not count:
            raise ValueError('server_name nao encontrado na configuracao do CRM.')
        if (urlsplit(args.address).scheme == 'https') != bool(re.search(r'(?m)^\s*listen\s+[^;]*\bssl\b', nginx_text)):
            raise ValueError('Protocolo solicitado difere do Nginx. Configure HTTP/TLS antes da troca.')
        if urlsplit(args.address).scheme == 'https':
            match = re.search(r'(?m)^\s*ssl_certificate\s+([^;]+);', nginx_text)
            if not match:
                raise ValueError('Certificado TLS nao encontrado.')
            flag = '-checkip' if re.fullmatch(r'[0-9.]+', host) else '-checkhost'
            run('openssl', 'x509', '-in', match[1].strip(), '-noout', flag, host)
            run('openssl', 'x509', '-in', match[1].strip(), '-noout', '-checkend', '0')
    print('Modo:', mode)
    for k, v in values.items():
        print(f'{k}={v}')
    print('Banco, health checks, upstreams e segredos permanecem nos destinos existentes.')
    if args.check_only:
        return
    run('docker', 'compose', 'version')
    lock = open(ROOT / '.git' / 'configurar-endereco.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    backup = Path(tempfile.mkdtemp(prefix='crm-endereco-', dir=env.parent))
    os.chmod(backup, 0o700)
    shutil.copy2(env, backup / 'env')
    if nginx_text is not None:
        shutil.copy2(args.nginx_conf, backup / 'nginx.conf')
    print('Backup privado:', backup, flush=True)
    compose = ('docker', 'compose', '--env-file', str(env))
    try:
        write_atomic(env, update_env(env.read_text(), values), 0o600)
        run(*compose, 'config', '--quiet')
        if nginx_text is not None:
            write_atomic(args.nginx_conf, nginx_text, 0o644)
            run('nginx', '-t')
        # Do not run migrations or recreate the database for an address-only change.
        run(*compose, 'up', '-d', '--build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', 'api', 'web')
        if nginx_text is not None:
            run('systemctl', 'reload', 'nginx')
        print('Endereco atualizado; health checks da API e web passaram:', values['WEB_ORIGIN'])
    except (subprocess.CalledProcessError, OSError):
        shutil.copy2(backup / 'env', env)
        if nginx_text is not None:
            shutil.copy2(backup / 'nginx.conf', args.nginx_conf)
        print('Falha: configuracoes restauradas. Tentando recuperar os servicos anteriores.', flush=True)
        try:
            run(*compose, 'up', '-d', '--build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', 'api', 'web')
            if nginx_text is not None:
                run('nginx', '-t')
                run('systemctl', 'reload', 'nginx')
        except (subprocess.CalledProcessError, OSError):
            print('Recuperacao automatica falhou; consulte docker compose logs. Backup:', backup)
        raise


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f'Erro: {exc}')
