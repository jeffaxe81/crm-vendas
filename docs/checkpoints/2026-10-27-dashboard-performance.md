# Dashboard — medição local reproduzível

Entrega em continuidade à issue#255, com domínio externo adiado. Novo modo opt-in no verificador GET existente; nenhuma mudança em consultas da API, banco, permissões ou telas.

## Rodada sintética

Imagem da API da maind105e808, PostgreSQL18.6 e papel sem SUPERUSER/BYPASSRLS em laboratório separado. Três empresas sintéticas, com100/1000/10000 registros de empresas e zero contatos/oportunidades/atividades. API e cliente no mesmo namespace de rede, HTTP loopback sem ingress/TLS; A API informa3CPUs lógicos disponíveis; containers sem quota própria de CPU/memória e Docker reportando9,735GiB de memória no host. Duas leituras de aquecimento por empresa,30amostras válidas por empresa em rodízio sequencial, concorrência1, percentis nearest-rank e relógio monotônico. Cada amostra inclui GET, JSON e validação de contagens/cache.

| Empresa sintética | Registros ativos | Amostras | p50(ms) | p95(ms) | Máximo(ms) |
| ----------------- | ---------------- | -------- | ------- | ------- | ---------- |
| A                 | 100              | 30       | 6,716   | 9,576   | 11,421     |
| B                 | 1000             | 30       | 6,691   | 11,681  | 35,337     |
| C                 | 10000            | 30       | 8,946   | 12,183  | 19,265     |

110requisições concluídas: verificações iniciais de catálogo/volume, releituraA apósB/C, anônimo401, tentativa de sobrescrever empresa400, APIkey/Superusuário403 nos dois endpoints, aquecimento e amostras. Todas as leituras bem-sucedidas exigiram private/no-store e contagens exatas. Nenhum token, ID de empresa, URL privada ou corpo HTTP consta da evidência versionada.

Memória em uma única leitura após a rodada: API236,7MiB e PostgreSQL60,06MiB. Isso não mede pico nem consumo sob concorrência. Os tempos descrevem esta execução aquecida, não estabelecem SLA, capacidade máxima, desempenho de outras distribuições ou equivalência ao servidor externo.

Evidência sanitizada: [JSON da rodada](evidence/2026-10-27-dashboard-performance.json). Instruções reproduzíveis e limites: [guia](../deploy/dashboard-staging-read-only-check.md).

## Verificação e limites

Dez testes direcionados aprovados após RED→GREEN; suíte de repositório113/113 aprovada com variáveis sintéticas de Compose. A primeira execução ampla encontrou somente falta de APP_DB_PASSWORD na configuração de teste; o rerun com a variável sintética passou. Não foi necessário alterar o contrato do Compose.

Esta rodada não conclui a issue#255: persistem homologação via ingress/HTTPS, cargas completas por tipo de entidade, consumo de pico/concorrência, revisão humana de acessibilidade/mobile e critérios de aceite acordados. O banco da instalação em uso não foi alvo de semeadura, teste destrutivo ou medição. Credenciais efêmeras do laboratório são revogadas ao encerrar a rodada.
