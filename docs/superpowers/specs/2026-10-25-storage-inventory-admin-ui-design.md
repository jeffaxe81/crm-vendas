# Consulta administrativa do inventário de backups

Continuidade autorizada do desenvolvimento do CRM, em incremento separado do endpoint da PR #311.

## Objetivo

Permitir que o Superusuário consulte o inventário global na área existente Backup e recuperação. A consulta é manual e somente leitura, sem alterar permissões, arquivos, cotas ou dados comerciais.

## Abordagem

Usar o endpoint existente em uma nova seção do painel administrativo: aproveita o guard da página e o contrato HTTP, sem novo backend. Uma tela independente duplicaria a navegação; misturar a consulta global com a reconciliação por empresa confundiria os escopos. A seção própria deixa explícito que abrange todas as empresas.

O navegador valida a resposta com um contrato Zod compartilhado. Mostra totais, bytes físicos conhecidos, contagem por empresa e ocorrências filtradas por estado. Tabelas exibem até 20 linhas por página, com paginação local que não dispara outras varreduras. Os bytes são strings inteiras, sem conversão para Number.

## Proteções e estados

- Nenhuma consulta no carregamento; GET sem query e com no-store somente após clique.
- Sem acesso pela navegação comum: o painel existente requer isSuperuser; o servidor continua sendo a autoridade.
- Troca da sessão/token remonta o estado, elimina resultados anteriores e ignora respostas tardias após desmontagem.
- Durante a consulta, botão bloqueado e estado de carregamento; erro elimina dados antigos e permite tentar novamente.
- Resposta inválida não produz totais; armazenamento não configurado e relatório incompleto não são apresentados como conferência concluída.
- Nunca exibir caminhos de arquivos, nomes inesperados ou conteúdos de backup. Uma entrada pode ter mais de uma ocorrência.
- Textos em português, inglês e espanhol. Metadados não provam integridade criptográfica ou restaurabilidade; bytes desconhecidos não entram nos totais.

## Validação

Contratos: aceitar inteiros grandes como strings e rejeitar resposta malformada. Interface: clique manual, estados de espera/erro, dados inválidos, indisponibilidade, paginação/filtro e troca de sessão com resposta tardia. Regressão do painel existente e dos catálogos, suíte web, tipos e CI. Sem deploy nesta tarefa.
