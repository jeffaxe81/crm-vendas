# Especificação de Produto e Arquitetura — CRM Axesistemas

**Versão:** 1.0  
**Data:** 30 de agosto de 2026  
**Status:** Aprovada pelo responsável pelo produto  
**Produto:** CRM Axesistemas

## 1. Finalidade

Esta especificação define o MVP do CRM Axesistemas. O produto deve resolver inicialmente duas necessidades: centralizar empresas e contatos e controlar um funil comercial pequeno. A base deve ser utilizável, compreensível e segura, sem antecipar recursos avançados que ainda não foram validados.

O CRM será inicialmente usado pela Axesistemas. A arquitetura, entretanto, nascerá preparada para separar várias organizações no futuro, evitando reconstrução do banco, das permissões e das APIs quando o produto for comercializado.

## 2. Objetivos do MVP

- autenticar usuários por e-mail e senha;
- separar usuários e dados por organização;
- cadastrar empresas e contatos;
- registrar o histórico de relacionamento;
- permitir tags e campos customizáveis;
- controlar funis e oportunidades;
- registrar valor, probabilidade, ganho, perda e motivo da perda;
- organizar tarefas, atividades, agenda e follow-ups;
- apresentar um dashboard comercial simples;
- manter permissões e auditoria;
- disponibilizar API REST com JWT;
- publicar eventos e webhooks autenticados;
- armazenar notas, links e documentos no hub de conhecimento;
- guardar metadados preparados para futura utilização por IA;
- incluir testes, documentação, changelog e checkpoints em todos os ciclos.

## 3. Não objetivos do MVP

Os itens abaixo não serão implementados no MVP, mas permanecerão registrados no backlog:

- cobrança, planos e autosserviço para novas organizações;
- MFA, SSO e identidade corporativa;
- módulos distribuídos, microsserviços e Kubernetes;
- inteligência artificial em produção, RAG ou banco vetorial;
- integrações específicas com telefonia, WhatsApp, e-mail ou calendários;
- gestão de projetos, propostas e catálogo de produtos;
- módulos verticais de Telecom, Comércio, Hotel e Saúde;
- aplicativo móvel nativo;
- telas B e C de navegação;
- personalização avançada por organização;
- alta disponibilidade e recuperação geográfica.

## 4. Princípios

1. Começar simples e validar o núcleo.
2. Registrar ideias novas no backlog antes de implementá-las.
3. Manter módulos com responsabilidades claras e baixo acoplamento.
4. Tratar APIs, eventos e webhooks como contratos versionados.
5. Aplicar segurança, auditoria, testes e documentação na medida adequada a cada ciclo.
6. Preservar o que funciona durante evoluções.
7. Ensinar as decisões técnicas durante a construção.
8. Preferir valor utilizável a volume de código.

## 5. Decisões aprovadas

| ID | Decisão |
|---|---|
| D-001 | Modelo híbrido: uso inicial pela Axesistemas com dados preparados para múltiplas organizações. |
| D-002 | TypeScript no frontend e backend, com Next.js, NestJS, PostgreSQL e Prisma. |
| D-003 | Monólito modular em monorepositório, dividido por responsabilidades de negócio. |
| D-004 | Modelo de dados com organização, contatos independentes de empresas, atividade unificada e Outbox. |
| D-005 | Segurança em camadas com Argon2id, JWT curto, refresh token protegido, RBAC, auditoria e HMAC. |
| D-006 | Menu lateral como estrutura visual principal. |
| D-007 | Opções B e C mantidas no backlog; App Shell preparado para futura variação visual. |
| D-008 | Navegação, telas e jornada comercial do MVP aprovadas. |

## 6. Perfis e visibilidade

| Perfil | Escopo inicial |
|---|---|
| Administrador | Configura a organização, usuários e dados; consulta auditoria. |
| Gestor | Visualiza e gerencia todos os dados comerciais da organização. |
| Vendedor | Trabalha com registros pelos quais é responsável ou participante. |
| Consulta | Visualiza dados autorizados, sem alterá-los. |

As permissões serão identificadas por ações, como `company.read`, `opportunity.move`, `user.manage` e `audit.read`. No MVP, os quatro perfis terão mapeamentos fixos no código. Perfis personalizados serão uma evolução.

## 7. Arquitetura

### 7.1 Estilo

O backend será um monólito modular. Haverá uma única unidade operacional, organizada internamente em módulos independentes. Microsserviços não serão usados no MVP porque aumentariam infraestrutura, monitoramento e dificuldade de diagnóstico antes de existir escala que justifique essa complexidade.

### 7.2 Componentes

- **Aplicação web:** Next.js;
- **API REST:** NestJS;
- **Banco relacional:** PostgreSQL;
- **Acesso ao banco e migrações:** Prisma;
- **Contratos compartilhados:** pacote TypeScript próprio;
- **Ambiente local:** Docker Compose;
- **Documentos:** armazenamento por interface compatível com objeto/arquivo;
- **Eventos:** Outbox no PostgreSQL com processador em segundo plano;
- **Documentação da API:** OpenAPI.

### 7.3 Módulos

- autenticação;
- organizações e vínculos;
- usuários e permissões;
- empresas e contatos;
- histórico de relacionamento;
- campos customizáveis e tags;
- funis e oportunidades;
- atividades e agenda;
- dashboard;
- hub de conhecimento;
- integrações, eventos e webhooks;
- auditoria.

### 7.4 Organização do repositório

```text
axes-crm/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── contracts/
│   ├── ui/
│   └── configuration/
├── infrastructure/
│   └── docker/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── decisions/
│   └── testing/
└── CHANGELOG.md
```

## 8. Preparação multiempresa

### 8.1 Modelo inicial

O PostgreSQL terá tabelas compartilhadas. Registros de negócio possuirão `organization_id`. A primeira organização será Axesistemas.

As entidades básicas serão:

- `organizations`;
- `users`;
- `organization_memberships`.

O usuário será global e sua participação em uma organização será definida por um vínculo. Isso permitirá que uma pessoa participe de mais de uma organização no futuro sem duplicar a conta.

### 8.2 Regras de isolamento

- a organização ativa virá da sessão autenticada;
- a API não confiará somente em identificadores enviados pela tela;
- consultas e alterações serão filtradas pela organização ativa;
- chaves únicas de negócio incluirão `organization_id` quando aplicável;
- arquivos, cache, tarefas, eventos, webhooks e auditoria carregarão o contexto da organização;
- testes tentarão ler e alterar registros de outra organização;
- RLS no PostgreSQL será obrigatório antes da comercialização externa.

### 8.3 Evolução comercial

Cadastro autônomo de organizações, planos, cobrança, cotas, domínios personalizados, identidade visual e administração global permanecerão fora do MVP.

## 9. Modelo de dados

### 9.1 Campos comuns

As entidades principais usarão UUID e, quando aplicável:

- `organization_id`;
- `created_at` e `updated_at`;
- `created_by` e `updated_by`;
- `version` para concorrência otimista;
- `deleted_at` e `deleted_by` para exclusão lógica.

### 9.2 Relacionamento

- empresas e contatos pertencem a uma organização;
- contatos podem existir sem empresa;
- o relacionamento entre empresas e contatos será muitos-para-muitos;
- contatos poderão ter vários canais, como telefone e e-mail;
- tags poderão ser vinculadas a empresas, contatos e oportunidades;
- campos customizáveis terão definição, tipo, escopo e valores validados;
- histórico comercial e auditoria serão estruturas diferentes.

### 9.3 Vendas

- uma organização poderá ter um ou mais funis;
- cada funil terá etapas ordenadas e probabilidade padrão;
- oportunidades estarão vinculadas a etapa, empresa, contato principal e responsável;
- o valor ponderado será calculado a partir do valor e da probabilidade;
- mudanças de etapa gerarão histórico;
- uma oportunidade poderá estar aberta, ganha ou perdida;
- motivo de perda será obrigatório ao encerrar como perdida.

### 9.4 Atividades

Tarefa, ligação, reunião, e-mail, follow-up e anotação usarão uma estrutura comum de atividade. Ela poderá se relacionar com empresa, contato e oportunidade. Atividades concluídas poderão compor a linha do tempo do relacionamento.

### 9.5 Conhecimento

Itens de conhecimento poderão ser notas, links ou documentos. Eles terão título, categoria, origem, autor, nível de acesso, relacionamentos e metadados. Campos de processamento por IA existirão apenas como metadados sem execução de modelos no MVP.

## 10. Experiência do usuário

### 10.1 Estrutura visual

O MVP usará menu lateral, recolhível em telas menores. A barra superior terá pesquisa global, criação rápida, organização ativa e menu do usuário.

O menu será agrupado em:

- Visão geral;
- Relacionamento: Empresas e Contatos;
- Vendas: Funil e Oportunidades;
- Trabalho: Atividades e Agenda;
- Conhecimento: Hub;
- Administração: Usuários, Configurações e Auditoria.

### 10.2 Fichas

Empresas e contatos terão fichas com abas para resumo, contatos relacionados, histórico, oportunidades, atividades, conhecimento e auditoria permitida.

### 10.3 Funil

O Kanban permitirá mover oportunidades por arrastar, botão ou teclado. A interface só confirmará a nova posição após resposta positiva da API. Em falha, retornará o cartão e explicará o problema.

### 10.4 Responsividade e acessibilidade

- tabelas serão adaptadas para cartões quando necessário;
- formulários usarão uma coluna em telas pequenas;
- cores não serão o único indicador de estado;
- ações principais serão acessíveis por teclado;
- mensagens serão exibidas próximas ao problema;
- estados vazios explicarão o próximo passo;
- arrastar não será a única forma de mover oportunidades.

## 11. Autenticação e segurança

- senhas serão protegidas com Argon2id;
- access tokens JWT terão duração curta;
- refresh tokens serão revogáveis e ficarão em cookie `HttpOnly`, `Secure` e `SameSite`;
- login terá limitação de tentativas e atraso progressivo;
- mensagens de autenticação não revelarão se uma conta existe;
- sessões serão encerradas quando o usuário for desativado;
- autorização verificará perfil, permissão, organização e propriedade;
- HTTPS será obrigatório em produção;
- segredos não serão armazenados no Git;
- arquivos terão autorização antes do download;
- logs não incluirão senhas, tokens ou segredos;
- horários serão armazenados em UTC.

MFA, SSO, WAF, SIEM e criptografia adicional de campos serão avaliados antes da operação comercial ou quando o risco justificar.

## 12. Auditoria

A auditoria será append-only para usuários comuns e registrará organização, usuário, ação, entidade, valores permitidos antes e depois, data, endereço IP quando aplicável e identificador da requisição.

## 13. API, eventos e webhooks

### 13.1 API REST

- prefixo inicial `/api/v1`;
- autenticação JWT;
- contratos documentados em OpenAPI;
- validação de entradas;
- paginação obrigatória em listagens;
- filtros e ordenação controlados;
- limite de tamanho de requisição;
- CORS restrito;
- `request_id` para correlação;
- respostas de erro padronizadas.

Formato de erro:

```json
{
  "code": "OPPORTUNITY_NOT_FOUND",
  "message": "Oportunidade não encontrada.",
  "request_id": "req_01HXYZ",
  "details": []
}
```

### 13.2 Eventos

Eventos iniciais:

- `company.created` e `company.updated`;
- `contact.created` e `contact.updated`;
- `opportunity.created`;
- `opportunity.stage_changed`;
- `opportunity.won` e `opportunity.lost`;
- `activity.created` e `activity.completed`;
- `knowledge_item.created`.

O dado de negócio e seu evento Outbox serão gravados na mesma transação.

### 13.3 Webhooks

Webhooks usarão HTTPS, segredo individual, assinatura HMAC, identificador do evento, data, número da tentativa, histórico, retentativas com atraso e reprocessamento manual autorizado.

## 14. Erros e observabilidade

Erros serão classificados como validação, autenticação, autorização, conflito, integração ou falha interna. Detalhes técnicos permanecerão nos logs; o usuário receberá mensagem clara e `request_id`.

O MVP terá:

- logs estruturados;
- organização e usuário quando permitido;
- duração de requisições;
- registro de erros;
- endpoint de saúde;
- verificação do banco;
- estado do processador de eventos.

## 15. Testes e qualidade

### 15.1 Estratégia

- testes unitários para regras de domínio;
- testes de integração para banco, autenticação e módulos;
- testes de contrato para API e eventos;
- testes ponta a ponta para jornadas críticas;
- checklist manual para responsividade, usabilidade e acessibilidade básica.

### 15.2 Jornadas críticas

1. autenticar e renovar uma sessão;
2. bloquear usuário desativado ou sem permissão;
3. impedir acesso entre organizações;
4. cadastrar empresa, contato, canais, tags e campos;
5. registrar relacionamento;
6. criar e movimentar oportunidade;
7. marcar oportunidade como ganha ou perdida;
8. criar e concluir atividade;
9. apresentar indicadores coerentes;
10. cadastrar nota, link e documento;
11. gerar, assinar, entregar e reprocessar webhook;
12. preservar auditoria e ocultar segredos.

## 16. Checkpoints, backup e retorno

Cada ciclo aprovado produzirá:

- commit identificado;
- tag ou checkpoint;
- changelog;
- migração versionada do banco;
- testes executados;
- instrução de retorno.

Antes de produção serão obrigatórios backup automatizado do banco e documentos, política de retenção, restauração testada e procedimento de recuperação.

## 17. Roadmap

| Ciclo | Resultado |
|---|---|
| 0 | Fundação, ambiente reproduzível, documentação e checkpoints. |
| 1 | Login, organização, usuários, permissões e auditoria. |
| 2 | Empresas, contatos, tags, campos e histórico. |
| 3 | Funil, oportunidades, ganhos e perdas. |
| 4 | Atividades, agenda e follow-ups. |
| 5 | Dashboard e hub de conhecimento. |
| 6 | API, eventos e webhooks. |
| 7 | Consolidação, segurança, documentação e versão candidata. |

## 18. Backlog priorizado do MVP

| ID | Item | Ciclo |
|---|---|---:|
| FND-001 | Estrutura do monorepositório | 0 |
| FND-002 | Docker Compose e ambiente reproduzível | 0 |
| SEC-001 | Login, logout e renovação de sessão | 1 |
| SEC-002 | Organizações e vínculos | 1 |
| SEC-003 | Perfis e permissões | 1 |
| SEC-004 | Isolamento multiempresa | 1 |
| AUD-001 | Auditoria imutável para usuários comuns | 1 |
| CRM-001 | Empresas | 2 |
| CRM-002 | Contatos e canais | 2 |
| CRM-003 | Relacionamento empresa–contato | 2 |
| CRM-004 | Histórico de relacionamento | 2 |
| CRM-005 | Tags | 2 |
| CRM-006 | Campos customizáveis | 2 |
| SAL-001 | Funis e etapas | 3 |
| SAL-002 | Oportunidades | 3 |
| SAL-003 | Movimentação e histórico | 3 |
| SAL-004 | Ganho, perda e motivo | 3 |
| ACT-001 | Atividades e tarefas | 4 |
| ACT-002 | Agenda | 4 |
| ACT-003 | Follow-ups e atrasos | 4 |
| DSH-001 | Dashboard simples | 5 |
| KNW-001 | Notas, links e documentos | 5 |
| KNW-002 | Metadados preparados para IA | 5 |
| API-001 | API REST documentada | 6 |
| EVT-001 | Eventos e Outbox | 6 |
| WHK-001 | Webhooks seguros | 6 |
| QUA-001 | Testes automatizados das jornadas críticas | Todos |
| DOC-001 | Documentação técnica e funcional | Todos |
| OPS-001 | Checkpoints, backup e restauração | Todos |

## 19. Critérios de aceite do MVP

O MVP estará apto para validação final quando:

1. usuários autorizados entrarem e saírem com segurança;
2. dados de organizações permanecerem isolados;
3. permissões impedirem operações indevidas;
4. empresas e contatos puderem ser cadastrados, relacionados e pesquisados;
5. histórico, tags e campos customizáveis funcionarem;
6. oportunidades percorrerem o funil preservando movimentações;
7. valor, probabilidade, ganho, perda e motivo forem registrados;
8. atividades, agenda e follow-ups puderem ser acompanhados;
9. o dashboard apresentar dados coerentes para cada perfil;
10. notas, links e documentos puderem ser vinculados ao cliente;
11. API e webhooks estiverem documentados, autenticados e testados;
12. alterações relevantes estiverem auditadas;
13. jornadas críticas tiverem testes automatizados;
14. a interface funcionar nos tamanhos de tela definidos;
15. instalação, atualização, backup e retorno estiverem documentados;
16. não houver falha crítica aberta de segurança ou integridade de dados.

## 20. Riscos e respostas

| Risco | Resposta planejada |
|---|---|
| Escopo crescer durante o MVP | Registrar e priorizar no backlog antes de implementar. |
| Vazamento entre organizações | Contexto obrigatório, filtros centralizados, testes adversariais e RLS antes da comercialização. |
| Complexidade de campos customizados | Limitar os tipos iniciais e não incluir fórmulas. |
| Divergência entre interface e API | Contratos compartilhados e testes de contrato. |
| Perda de evento de integração | Outbox transacional e reprocessamento. |
| Dificuldade de recuperação | Checkpoints, migrações versionadas e restauração testada. |
| Três layouts aumentarem manutenção | Implementar apenas A; manter App Shell extensível. |
| IA aumentar custo e escopo | Guardar apenas metadados; implementar IA após validação do núcleo. |
