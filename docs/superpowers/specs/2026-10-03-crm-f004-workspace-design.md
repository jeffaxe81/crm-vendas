# CRM-F004 — Tela inicial e navegação personalizáveis

Status: desenho para revisão. Branch de destino: `feat/crm-workspace-testing`. A implementação será registrada como EM TESTE, sem merge em main.

## Objetivo aprovado

Reduzir a quantidade de botões visíveis, agrupar funções relacionadas e permitir que cada usuário configure sua tela de entrada. Preservar o design Dispatch, o dashboard CRM-F003 e a comunicação persistente. Preferências acompanham o usuário entre dispositivos, separadas por organização.

## Navegação

Entrada permanente **Início**, seguida de Favoritos e cinco grupos recolhíveis:

| Grupo         | Destinos                                                              |
| ------------- | --------------------------------------------------------------------- |
| Comercial     | Empresas, Contatos, Oportunidades, Produtos                           |
| Produtividade | Agenda, Atividades                                                    |
| Atendimento   | Solicitações, Comunicação integrada                                   |
| Gestão        | Resumo gerencial, Territórios                                         |
| Administração | Usuários e perfis, Configuração de atendimento, Preferências pessoais |

Grupos vazios são omitidos. O grupo da seção ativa fica expandido; demais grupos começam recolhidos. Favoritos mostram até seis destinos permitidos na ordem escolhida. No menu recolhido, os controles continuam com nomes acessíveis. No celular mantém-se o drawer, fechamento ao navegar, Escape e gestão de foco existentes.

Um catálogo único de destinos e permissões será compartilhado pelo menu, editor de favoritos e validação da seção inicial. Empresas e contatos também devem respeitar suas permissões de leitura; não haverá destinos disponíveis apenas porque o menu anterior não verificava a permissão.

Administração reutiliza `admin/users` para listar/criar usuários e alterar papel/ativação de vínculos com `user.manage`; não cria um editor arbitrário de permissões ou novos papéis. Configuração de atendimento reúne as telas existentes de filas e SLA para `support.manage`, preservando sua API. As telas operacionais continuam acessíveis a quem pode ler atendimento.

## Tela inicial

Tela dedicada, com saudação, data e componentes configuráveis:

1. Favoritos: atalhos para destinos permitidos.
2. Pendentes de hoje: reutiliza a agenda com foco inicial TODAY e paginação.
3. Indicadores comerciais: reutiliza os componentes do dashboard CRM-F003, sem reproduzir a lista inteira de abas de relatórios na tela inicial.

Cada componente pode ser ocultado e reordenado por botões acessíveis. O editor só aparece após clicar **Personalizar início**. Se todos forem ocultos, permanece uma mensagem com acesso ao editor e restauração de padrão. O usuário escolhe a seção de abertura entre Início e destinos permitidos. O padrão para uma preferência ausente é Início.

Widgets de agenda requerem `activity.read`; indicadores requerem `reports.read`. Favoritos de módulos sem permissão são filtrados. Uma preferência não concede acesso. Os relatórios e métricas mantêm o significado documentado em CRM-F003; não haverá filtros globais novos nesta entrega.

## Contrato de preferências

Endpoints autenticados `GET /me/workspace-preferences` e `PUT /me/workspace-preferences`.

Identidade de usuário/organização vem exclusivamente do principal autenticado, nunca de parâmetros ou payload. GET retorna defaults quando não houver registro. PUT valida estritamente um payload versionado:

- `version: 1`;
- `defaultSection`: enum de destinos conhecidos;
- `favorites`: array de IDs conhecidos, únicos, máximo seis;
- `homeOrder`: permutação dos três IDs de componentes;
- `homeHidden`: subconjunto único desses IDs;
- `dashboardOrder`: permutação dos seis IDs da CRM-F003;
- `dashboardHidden`: subconjunto único desses IDs.

Não há HTML, URLs externas, tokens ou dados de negócio nessas preferências. Escritas ocorrem por **Salvar preferências**; mudanças são rascunho até salvar. **Restaurar padrão** muda o rascunho e requer salvar. O backend rejeita favoritos/seção inicial incompatíveis com as permissões atuais. Ao ler preferências antigas após alteração de perfil, o frontend descarta destinos proibidos e usa Início como fallback. PUT devolve o registro salvo.

Concorrência entre dispositivos usa última gravação concluída. Não há edição colaborativa ou atualização por websocket. Preferências são buscadas após login/restauração de sessão; o usuário ainda pode navegar enquanto a consulta está pendente. A chegada da resposta não substitui uma navegação manual já realizada. Ao trocar usuário/organização ou sair, preferências e rascunhos são descartados.

Se GET falhar, usar defaults e mostrar aviso. Se PUT falhar, preservar rascunho, permitir tentar novamente e não indicar salvamento. Não gravar dados comerciais em cache local. As preferências de dashboard já existentes no localStorage continuam válidas na CRM-F003 isolada; no workspace com preferências do servidor, estas prevalecem. Migração do layout local só é sugerida ao usuário no editor e persistida por Salvar, nunca silenciosamente.

## Persistência e segurança

Novo modelo `UserWorkspacePreference` com organizationId, userId, preferences JSONB, createdAt e updatedAt. Unicidade por organizationId/userId e relação composta para OrganizationMembership existente. Migração aditiva, sem alterar registros atuais. Banco usa RLS e FORCE RLS conforme o padrão do projeto para organização; o service sempre adiciona o filtro de usuário. Não expor listagem ou edição das preferências de outro usuário, nem para administradores nesta entrega.

APIs seguem guards, validação de contratos, erros e contexto de tenant do projeto. Auditoria da alteração registra a ação e identidade, sem tokens. Regras administrativas existentes, inclusive impedimentos à desativação do último administrador quando aplicáveis, continuam no backend.

## Estados e comunicação

Início tem estados de carregamento/erro/vazio próprios por componente. Preferências indisponíveis não bloqueiam o login ou a navegação. A comunicação NEO só é montada após primeira abertura autorizada e permanece montada ao trocar de grupo, visitar Início ou editar preferências; logout remove o iframe como atualmente. Personalizar não abre o NEO nem transfere informações ao serviço externo.

## Verificação e critérios de aceite

- Contratos: enums, duplicatas, limites, campos desconhecidos e layouts incompletos rejeitados.
- Backend: GET default, upsert, leitura entre sessões, isolamento por usuário/organização, revogação de acesso, auditoria e erros.
- Administração: leitura/criação/alteração com APIs existentes e bloqueio sem permissões.
- Frontend: agrupamento, favoritos, seção ativa, fallback sem permissão, edição/salvamento/restauração, falhas, preferências atrasadas após navegação manual e troca de identidade.
- Início: permissão por componente, ordenação/ocultação, nenhum componente, links para relatórios e manutenção do iframe.
- Acessibilidade: nomes dos botões, teclado, aria-expanded, foco em menu desktop/mobile.
- Homologação: dois usuários da mesma organização, mesmo usuário em organizações distintas, dois navegadores e telas pequenas.
- Gate: testes, tipos, builds e integração PostgreSQL/Compose/E2E quando disponíveis. Limitações do executor serão registradas; testes simulados não substituem banco real.

## Fora desta entrega

Construtor de widgets/relatórios genéricos, edição por administrador de dashboards alheios, sincronização ao vivo, alteração de papéis/permissões do produto e filtros globais novos.

## Ordem de execução proposta

1. Contratos e persistência de preferências com segurança e testes.
2. API de preferências e integração de sessão.
3. Catálogo de navegação, grupos e favoritos.
4. Tela inicial e editor, incluindo integração do dashboard.
5. Administração com APIs/componentes existentes.
6. Regressão, homologação, documentação CRM-F004 e branch EM TESTE.
