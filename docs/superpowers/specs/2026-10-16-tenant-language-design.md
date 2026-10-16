# Idioma do CRM por tenant

## Objetivo aprovado
Disponibilizar Português do Brasil, Inglês e Espanhol, com configuração independente por tenant e opção de acompanhar o idioma do navegador. Português do Brasil permanece como padrão.

## Administração e persistência
Adicionar em Administração uma seleção de idioma padrão (pt-BR, en, es) e um checkbox de detecção automática, inicialmente desativado. Apenas administradores autorizados do tenant podem alterar essas configurações. Persistir a política na organização, com validação no contrato e na API. Determinar a organização pela sessão autenticada, nunca por um identificador livre enviado pelo cliente. Registrar alterações em auditoria e incluir a configuração no backup/restauração do tenant.

## Resolução
Com detecção desativada, usar o idioma padrão do tenant. Com detecção ativada, considerar o primeiro idioma informado por navigator.languages, com fallback para navigator.language. Mapear en-* para en, es-* para es e pt-* para pt-BR. Idioma diferente ou indisponível resulta em pt-BR. A leitura acontece no navegador, sem acesso direto ao sistema operacional.

## Isolamento e login
Trocar ou encerrar a sessão limpa o estado de idioma da organização anterior. Antes de identificar um tenant, o login usa pt-BR. Depois de identificar o tenant, aplicar sua política. Se houver lembrança local para o login, guardar somente a política pública de idioma, identificada pelo tenant, e revalidar após autenticação. Não armazenar credenciais junto a essa preferência. Não aplicar a política de uma organização a outra.

## Traduções
Introduzir catálogos versionados de mensagens pt-BR, en e es e um provedor de idioma compartilhado. Migrar textos de interface, acessibilidade, validações e mensagens de erro apresentadas ao usuário. Usar chaves estáveis e interpolação segura. Ausência de tradução retorna ao catálogo pt-BR. Atualizar o atributo lang do documento e evitar divergência entre renderização inicial e hidratação. Nenhum serviço externo de tradução é necessário.

## Limites
Não traduzir dados cadastrados, nomes próprios, documentos anexados, logs técnicos ou conteúdo de integrações externas. Não converter moeda, valores, fuso horário ou dados persistidos ao mudar o idioma. Não incluir preferência individual adicional nesta entrega; a política pertence ao tenant. Compatibilidade completa com Windows 7 depende de homologação própria e não é garantida pelo recurso de idioma.

## Verificação
Testar as combinações de modo manual/automático, variantes regionais e idioma desconhecido. Verificar isolamento entre dois tenants, permissões de alteração, troca de sessão, login, fallback e persistência. Verificar paridade de chaves entre catálogos, interpolação e telas principais nos três idiomas. Executar os testes pertinentes de API e frontend, typecheck e build antes de declarar entrega. A implementação não será considerada completa com apenas o seletor ou parte das telas traduzidas.
