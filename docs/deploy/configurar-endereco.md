# Trocar IP ou domínio de acesso

Requer Python 3, Docker Compose v2 com suporte a `--wait` e `.env` configurado.
Execute com a stack já inicializada (banco e migrations concluídos).

```bash
sudo bash scripts/configurar-endereco.sh http://127.0.0.1
sudo bash scripts/configurar-endereco.sh http://192.168.40.84
sudo bash scripts/configurar-endereco.sh https://crm.exemplo.com.br --mode proxy
```

Sem Nginx configurado, o modo direto publica web em 3000 e API em 3001.
Assim, o primeiro exemplo abre em http://127.0.0.1:3000. Acesso de rede
publica essas duas portas em todas as interfaces; configure firewall conforme
sua rede. No WSL, acesso de outras máquinas pode exigir encaminhamento no Windows.
`127.0.0.1` sempre representa a própria máquina de quem abre o navegador.

Com `/etc/nginx/conf.d/crm-vendas.conf` existente, o modo proxy é automático.
No Ubuntu com outro caminho, informe `--nginx-conf /etc/nginx/sites-available/crm-vendas`
(apontando para o arquivo dedicado ao CRM e já habilitado).
DNS, firewall, instalação do Nginx e emissão de certificados são pré-requisitos.
HTTPS exige certificado vigente que cubra o IP/domínio; o script não o substitui.
O protocolo deve coincidir com a configuração existente do proxy.

Prévia sem alteração ou reinício:

```bash
sudo bash scripts/configurar-endereco.sh http://192.168.40.84 --mode direct --check-only
```

O script altera somente `WEB_ORIGIN`, `NEXT_PUBLIC_API_BASE_URL`,
`WEB_BIND_ADDRESS`, `API_BIND_ADDRESS` e os `server_name` do arquivo Nginx
informado. Banco, `BIND_ADDRESS`, URLs internas, health checks, upstreams,
chaves e senhas são preservados. Em modo proxy, web/API são publicados em
127.0.0.1; em modo direto externo, apenas essas duas portas passam a 0.0.0.0.
Não há substituição global de endereços nos arquivos.

Após backup privado da configuração, valida Compose/Nginx, reconstrói e recria
somente API/web e aguarda os health checks internos. Não executa migrations,
não apaga volumes e não reinicializa o banco. Falhas restauram a configuração
e tentam reconstruir os serviços com os valores anteriores. O backup fica
em `crm-endereco-*`, ignorado pelo Git; contém segredos, mantenha-o privado.
A recuperação pode exigir intervenção se Docker/build também falhar.
Valide o acesso no navegador após a troca; os health checks internos não
comprovam DNS, firewall, confiança da cadeia TLS ou acesso pela rede externa.

Teste automatizado: `python3 -m unittest discover -s scripts/tests`.
