# Assistente de Qualidade do CRM — especificação V1
Data: 16/10/2026
Status: desenho conversacional aprovado; especificação escrita para revisão.

## Objetivo
Simular a jornada de um usuário comum, começando pela criação de empresa e usuário, observar front-end, APIs e back-end e pedir uma decisão humana quando ocorrer comportamento inesperado. Não prometer detecção de todos os bugs.

## Abordagem e limites
A V1 usa cenários guiados e verificáveis com Playwright, já presente no projeto. Exploração livre por IA fica para uma versão posterior. Uma alternativa restrita a chamadas HTTP não cobre a experiência visual; exploração autônoma inicial teria resultados menos reproduzíveis. O assistente não corrige código nem realiza merge.
Execução manual, por administrador autorizado, exclusivamente em homologação com dados sintéticos. Não inclui agendamento ou notificações externas. Execuções são serializadas na V1.

## Jornada ordenada
1. Criar empresa/tenant pela interface existente, validando campos obrigatórios e duplicidade segundo as regras atuais.
2. Criar o usuário vinculado à empresa. Se o cadastro atual criar o administrador junto da empresa, verificar esse resultado antes de criar o usuário padrão; não inventar um cadastro separado.
3. Entrar com o usuário padrão, confirmar tenant e sessão.
4. Verificar permissões de usuário comum e isolamento usando duas empresas sintéticas pertencentes à execução. O mesmo e-mail em empresas diferentes deve funcionar; duplicidade dentro da mesma empresa segue a regra vigente.
5. Cadastrar, pesquisar e editar contatos e clientes conforme funcionalidades realmente existentes.
6. Criar oportunidade, movimentar pelo funil e confirmar persistência após recarregar.
7. Exercitar filtros e operações disponíveis no roteiro versionado.
A preparação administrativa fica separada da sessão de usuário padrão. Privilégios administrativos não podem mascarar falhas de permissão no roteiro comum.

## Componentes
- Tela Administração > Assistente de Qualidade: iniciar, acompanhar etapas, consultar ocorrências, decidir e cancelar.
- API NestJS: autorização, criação e consulta da execução, ocorrências e decisões, sempre com escopo de tenant obtido da sessão.
- Executor Playwright separado do processo HTTP: executa apenas roteiros conhecidos contra a URL de homologação configurada no servidor. Não aceita URLs, scripts ou comandos arbitrários do navegador.
- Persistência PostgreSQL/Prisma: execução, etapa, ocorrência e decisão, com RLS e auditoria seguindo o projeto.
- Contratos compartilhados: estados e entradas validadas. Identificadores de correlação conectam evidências da interface a erros do servidor quando disponíveis.

## Estados e decisões
Execução: pendente, executando, aguardando decisão, concluída, cancelada ou falha de infraestrutura.
Etapa: pendente, executando, aprovada, com ocorrência ou bloqueada.
Toda anomalia cria ocorrência e coloca a execução em aguardando decisão no próximo ponto seguro. Não executar ações dependentes antes da resposta.
Decisões: registrar como bug, investigar, comportamento esperado ou ignorar nesta execução.
Registrar bug e investigar mantêm a etapa suspensa até escolher repetir, pular dependentes ou encerrar. Comportamento esperado e ignorar só permitem continuidade se as pré-condições estiverem satisfeitas. Falha de criação da empresa bloqueia criação do usuário e etapas dependentes.
Após reinício do executor, uma execução interrompida exige decisão; não repetir automaticamente cadastros.
Ocorrências repetidas na mesma execução são agrupadas por assinatura, mantendo contagem e evidências.

## Evidências e detecção
Armazenar passos, resultado esperado/observado, etapa, horário, severidade preliminar e ocorrência correlacionada. Capturar falhas de rede, erros JavaScript, respostas HTTP e divergência entre mensagem visual e persistência.
Erros HTTP esperados em testes negativos não são classificados automaticamente como bugs. Latência isolada é observação, não prova de defeito.
Correlacionar erros de back-end por identificador quando a instrumentação existente permitir; ausência de logs não significa ausência de erros.
Capturas devem usar apenas dados sintéticos e mascarar campos sensíveis. Não persistir senhas, cookies, tokens ou corpos completos indiscriminadamente. Não habilitar trace bruto que retenha credenciais sem sanitização.
Evidências acessíveis somente a administradores autorizados do escopo correspondente, retidas por sete dias; metadados e decisões permanecem por 30 dias na V1.

## Isolamento e preparação
O executor usa tenant e usuário de teste exclusivos identificados pela execução. A criação de empresas de teste ocorre pelo fluxo de onboarding disponível e nunca amplia permissões de usuários comuns.
Teste de isolamento tenta acessar apenas registros das duas empresas sintéticas da própria execução. Resultados do segundo tenant não são expostos em listagens do primeiro.
Dados sintéticos permanecem identificados para reprodução e são removidos por limpeza restrita aos IDs criados pela execução, após o encerramento ou expiração de sete dias. Falha de limpeza é informada, sem exclusão ampla.
Credenciais do executor são fornecidas por configuração de servidor; não aparecem em respostas da API ou evidências.

## Falhas operacionais
Indisponibilidade do navegador, banco ou ambiente é falha de infraestrutura, distinguida de defeito confirmado no CRM. Cancelamento interrompe novos passos e encerra o navegador. Tempo máximo de 30 minutos por execução, descontando espera por decisão; espera expira em 24 horas e encerra a execução.
A V1 não envia mensagens, e-mails ou integrações reais durante os testes.

## Validação e critérios de aceite
- Empresa é criada antes de usuário; sessão comum é usada no restante da jornada.
- Criar usuário falha: próximas etapas ficam bloqueadas com evidência e pergunta.
- Erro da API com sucesso visual gera ocorrência.
- Recarregamento confirma persistência dos dados sintéticos.
- Mesmo e-mail funciona em empresas distintas.
- Usuário comum não recebe privilégios administrativos nem acessa outro tenant.
- Decisões, cancelamento e retomada respeitam pré-condições e são auditados.
- Logs e evidências não contêm credenciais.
- Testes unitários cobrem transições e sanitização; integração cobre autorização/RLS; E2E cobre jornada e pausa diante de falha induzida.
- Uma execução sem ocorrências informa os cenários executados, sem declarar ausência total de bugs.

## Próxima etapa
Após revisão desta especificação, escrever o plano de implementação com os caminhos reais dos módulos, migrações, executor e testes. Ainda não houve implementação do produto nem execução da jornada.
