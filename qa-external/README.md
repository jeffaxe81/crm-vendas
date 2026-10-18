# AXE QA Lab — módulo externo de simulação de uso do CRM

Módulo de testes black-box e independente do backend e do frontend: consome somente HTTP(S) da API, usa Playwright para navegador e gera evidências fora do código da aplicação. **Não altera banco por SQL, não faz limpeza destrutiva e não habilita restore.**

## Modos de execução

- **read (padrão):** health real, proteção de endpoints sem sessão, disponibilidade do frontend; não faz login nem grava dados.
- **write:** usa uma **instalação isolada e descartável de homologação**, cria dois tenants e dados **inteiramente sintéticos**; verifica login válido/inválido, empresas, contatos, canal, funil, oportunidades, atividades, chamados, relatórios e negativas de acesso cruzado. Os registros persistem para análise; **não executa DELETE ou TRUNCATE**.
- **browser:** valida login desktop e mobile, rolagem horizontal e contagem de erros JavaScript; autenticação/logout só se forem fornecidas credenciais de **conta sintética**. Publica apenas nomes fixos, status e contagens; evidências visuais higienizadas são registradas manualmente.

Requisitos: Node.js 24+, CRM já executando no endereço da QA. O runner API usa somente bibliotecas nativas Node. Playwright e os autotestes do reporter utilizam a dependência de desenvolvimento da raiz do repositório, previamente instalada com pnpm.

### Um comando por ação

**Smoke somente leitura (pode avaliar disponibilidade sem criar dados):**

    QA_API_URL=https://qa.exemplo.com/api/v1 QA_WEB_URL=https://qa.exemplo.com node qa-external/run.mjs

**Jornada real automatizada com escrita (SOMENTE QA isolada):**

    QA_API_URL=https://qa.exemplo.com/api/v1 QA_WEB_URL=https://qa.exemplo.com QA_MODE=write QA_TARGET_KIND=isolated QA_CONFIRM_ORIGIN=https://qa.exemplo.com QA_WRITE_ACK=ACEITO_CRIAR_DADOS_SINTETICOS node qa-external/run.mjs

**Navegador em desktop + mobile (sem escrita):**

    QA_WEB_URL=https://qa.exemplo.com pnpm exec playwright test -c qa-external/playwright.config.ts

**Navegador com usuário sintético já cadastrado:**

    QA_WEB_URL=https://qa.exemplo.com QA_TEST_EMAIL=qa-usuario@example.test QA_TEST_PASSWORD='senha-de-teste' QA_TEST_TENANT=tenant-de-teste pnpm exec playwright test -c qa-external/playwright.config.ts

**Autotestes do módulo:**

    node --test tests/qa-external-*.test.mjs

## Segurança e isolamento

1. Confirme pessoalmente que a URL alvo é uma instância QA **descartável e sem dados reais**. As três variáveis de escrita são confirmação do operador, não detecção técnica do ambiente. **Não use a instância de produção da Axesistemas.**
2. Fora de localhost, apenas HTTPS válido é permitido. Não há opção para ignorar verificação de certificado ou seguir redirecionamentos HTTP 3xx. O navegador intercepta respostas antes de entregá-las à página, recusa todo 3xx (inclusive mesma origem), bloqueia service workers e permite somente a origem `QA_WEB_URL`. Se a API usar outra origem, informe também `QA_API_URL` com o prefixo `/api/v1`; nenhuma origem de terceiros é liberada automaticamente.
3. O modo write não reusa usuários reais: cria tenants, e-mails em domínio .test e dados com prefixo QA. Nunca envia mensagem externa, ativa expurgo, aciona restore ou apaga tenants.
4. Não armazena tokens, cookies ou senhas no relatório; erros de transporte/JSON usam mensagens fixas sem copiar payload remoto. Todas as execuções de navegador usam o reporter seguro, sem HTML, erros/steps brutos, stdout/stderr do teste ou anexos. Trace, captura e vídeo ficam desligados; `PLAYWRIGHT_NO_COPY_PROMPT=1` impede copiar a página/ARIA e `preserveOutput=never` remove os contextos/anexos temporários ao terminar cada teste. `PW_TEST_REPORTER` e `--reporter` são recusados para impedir reporters extras ou substitutos. Não altere essas opções ao coletar evidência. Evidências locais em qa-external/artifacts/ são ignoradas no Git; proteja a pasta contra leitura indevida.
5. Falha de API não significa automaticamente bug de produto: conferir se cadastro público, permissões, migrações e recursos estão habilitados na instalação de QA. Registrar causa e classificar separadamente.
6. Desabilitar cadastro público, ausência de privilégios e features opcionais deve ser tratado como bloqueio/configuração, não como sucesso presumido.
7. Um conjunto verde de testes **não substitui homologação operacional**, isolamento sob role real, restauração isolada, revisão LGPD, áudio NEO ou aceite humano. O relatório mantém productionApproved=false.

## Artefatos gerados

O runner cria qa-external/artifacts/qa-<execução>.json e .md contendo IDs, estados PASS/FAIL/BLOCKED, durações e motivos. O navegador cria somente `qa-external/artifacts/browser-safe/qa-browser-<id>.json` com nomes catalogados, projeto desktop/mobile, estados e contagens. Teste ignorado, interrompido ou apenas listado é BLOCKED; nunca é aprovação presumida. Ambos mantêm `productionApproved=false` e homologação manual pendente. Não publicam dados automaticamente.

Não há HTML, trace, vídeo, screenshot ou `error-context.md` preservado para diagnóstico automático. Para investigar uma falha, reproduza em QA com dados sintéticos e registre manualmente evidência mínima conforme o checklist; revise e remova senhas, tokens, cookies, payloads e dados de tela antes de salvar ou compartilhar.

Preencher o [CHECKLIST_MANUAL.md](./CHECKLIST_MANUAL.md) para os testes não automatizados ou não conclusivos. Critérios de GO: nenhum FAIL/BLOCKED crítico, checklist manual P0 concluído, evidência de restauração e rollback, TLS/segurança e aceite registrado em ambiente e SHA exatos.
