# Medição local de dashboards

## Objetivo e escopo

Continuar o desenvolvimento solicitado, respeitando a preferência já expressa por execução direta e pelo adiamento de domínio/credenciais externas. Avançar a evidência reproduzível da issue #255 com três empresas sintéticas e medições de latência. Não declarar concluídas homologação HTTPS, avaliação humana de acessibilidade ou aprovação de produção.

## Abordagem

Ampliar o smoke GET existente é a escolha do implementador: reutiliza autenticação, contagens, headers e barreiras multi-tenant. Um gerador de carga paralelo novo aumentaria superfície e poderia confundir latência com capacidade máxima; um relatório apenas manual não seria reproduzível.

A opção `performance` contém `warmupIterations` inteiro de0a10 e `samplesPerTenant` inteiro de5a100. Ausente, preserva saída e tráfego atuais. Presente, executa leituras sequenciais em rodízio A/B/C após as verificações normais. Cada amostra mede fetch, leitura e validação completos do volume com relógio monotônico. Toda amostra valida contagens e private/no-store; qualquer erro interrompe a rodada, sem relatório de sucesso parcial.

O resultado inclui metodologia explícita (sequencial, concorrência1, timeout15000ms, percentis nearest-rank), contagem de requisições e, por labelA/B/C, número de amostras, mínimo, máximo, p50 e p95 em milissegundos. Aquecimento não entra nos percentis. Erros, tokens, URLs, IDs de organização e corpos HTTP não aparecem no relatório. Não inventar SLA nem chamar essa medição de teste de saturação.

A CLI aceita JSON opcional em `DASHBOARD_STAGING_PERFORMANCE_JSON`; no modo de medição, imprime JSON sanitizado. Persistência fica a cargo do operador, fora do Git. Não adicionar dependências. Validar configurações antes do primeiro GET, limitar trabalho e rejeitar relógios inválidos sem expor suas mensagens.

## Evidência

Testes determinísticos de percentis, aquecimento, limites, relógio inválido, falha de dados/cache/rede e compatibilidade. Executar a imagem já publicada contra PostgreSQL sintético separado, preparando100/1000/10000 empresas respectivamente emA/B/C; a semeadura é privada e não faz parte do verificador GET. Registrar contagens reais, ambiente, versões e resultados sem credenciais. O banco do CRM em uso não é alvo de semeadura ou medições.
