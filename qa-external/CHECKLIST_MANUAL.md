# AXE QA Lab — checklist de testes reais e revisão humana

**Estado inicial: TODOS NÃO EXECUTADOS.** Nunca marcar PASS apenas por PR, teste unitário ou CI aprovado.

Registrar por sessão: **data/hora**, **operador**, **URL**, **ambiente isolado**, **SHA da versão instalada**, **navegador/SO**, **evidência sem dados sensíveis**, **resultado PASS/FAIL/BLOCKED/NA**, **ID do defeito** e **reteste**.

| ID | Prioridade | Perfil/área | Roteiro em ambiente real | Critério de aceite | Evidência | Resultado inicial |
|---|---|---|---|---|---|---|
| M-001 | P0 | Infraestrutura | Comparar versão instalada, imagem Docker e SHA aprovado no CI | Versão/digest correspondem ao candidato | logs sem segredo | NÃO EXECUTADO |
| M-002 | P0 | Segurança | Acessar HTTPS a partir de outra máquina, usando CA confiável, sem -k | Cadeia, SAN e redirecionamento corretos | inspeção TLS | NÃO EXECUTADO |
| M-003 | P0 | Infraestrutura | Reiniciar containers em QA e retomar login e CRUD | Nenhuma perda de dados; health consistente | antes/depois e logs | NÃO EXECUTADO |
| M-004 | P0 | Isolamento | Dois tenants com usuários e roles diferentes; testar leitura, alteração, relatórios e arquivos cruzados | Nenhum dado de outra organização exposto ou mutado | requests e IDs sintéticos | NÃO EXECUTADO |
| M-005 | P0 | Autorização | ADMIN, MANAGER, SELLER, VIEWER e superusuário | Menus e API respeitam permissões | matriz por papel | NÃO EXECUTADO |
| M-006 | P0 | Recuperação | Executar backup cifrado e verificar checksum, volume, quota e download em QA | Arquivo recuperável e íntegro | manifesto e checksum | NÃO EXECUTADO |
| M-007 | P0 | Recuperação | Restaurar backup de teste em CÓPIA ISOLADA, nunca sobre dados reais | Empresas, contatos, oportunidades, atividades, tickets e relações reconciliados | comparação de registros | NÃO EXECUTADO |
| M-008 | P0 | Continuidade | Simular falha/interrupção de backup/restore e ensaiar rollback seguro | Não perde consistência e recupera operação | log e RPO/RTO medidos | NÃO EXECUTADO |
| M-009 | P0 | Cadastro | Criar tenant novo via tela, primeiro ADMIN e login/logout | Usuário e organização persistem após reinício e nova sessão | vídeo sem senha | NÃO EXECUTADO |
| M-010 | P0 | Onboarding | Concluir wizard de quatro passos e tour; reentrar e rever ajuda | Estado individual, sem bloqueio da interface | vídeo e resultado | NÃO EXECUTADO |
| M-011 | P0 | Fluxo comercial | Empresa → contato → canal → vínculo → histórico → oportunidade → mudança de etapa → tarefa | Dados persistem e relatórios refletem operação | IDs e prints | NÃO EXECUTADO |
| M-012 | P0 | Atendimento | Abrir ticket, atribuir, comentar, aguardar, resolver, reabrir e fechar | Protocolo, histórico, SLA e auditoria corretos | IDs sintéticos | NÃO EXECUTADO |
| M-013 | P0 | Credenciais | Bloquear sessão expirada, logout, troca de tenant e abas simultâneas | Sessão antiga não altera tenant novo | HAR higienizado | NÃO EXECUTADO |
| M-014 | P0 | Atualização | Ensaiar migrations com cópia do banco da versão anterior | Upgrade e eventual rollback sem perda | registro de ensaio | NÃO EXECUTADO |
| M-015 | P1 | UX | Importar CSV empresas no primeiro clique, revisar duplicados e confirmar gravação | Prévia clara; dados não duplicados indevidamente | vídeo e CSV fictício | NÃO EXECUTADO |
| M-016 | P1 | UX | Importar CSV contatos, validar vínculo com empresa e campos inconsistentes | Mapeamento e feedback corretos | arquivo sintético | NÃO EXECUTADO |
| M-017 | P1 | Marca | Salvar logo, cores, logout/login, alternar tenants e navegadores | Logo/cores isolados; fallback correto | capturas | NÃO EXECUTADO |
| M-018 | P1 | Idiomas | pt-BR, en, es e detecção pelo navegador; trocar tenant | Idioma e textos consistentes, sem troca de dados | capturas por idioma | NÃO EXECUTADO |
| M-019 | P1 | Comercial | Importar produtos, incluir itens na oportunidade, editar quantidades e preços | Soma coerente e histórico preservado | CSV e cálculos | NÃO EXECUTADO |
| M-020 | P1 | Indicadores | Comparar relatórios por vendedor, produto, mês, funil e resumo | Totais e filtros coerentes com base de QA | export e cálculo manual | NÃO EXECUTADO |
| M-021 | P1 | UX | Desktop 1366px, 1920px, tablet e celular 390px | Sem sobreposição, rolagem indevida ou controles inacessíveis | screenshots | NÃO EXECUTADO |
| M-022 | P1 | Acessibilidade | Teclado, foco, contraste, labels, leitores de tela | Formulários utilizáveis sem mouse | gravação e observações | NÃO EXECUTADO |
| M-023 | P1 | Desempenho | 1, 10 e 50 usuários sintéticos com dados autorizados em QA | Latências, erros e throughput medidos sem colapso | métricas e carga | NÃO EXECUTADO |
| M-024 | P1 | Rede | Interromper rede durante salvar e retornar conexão | Não duplica; exibe erro e permite retry | vídeo e requests | NÃO EXECUTADO |
| M-025 | P1 | Telefonia/NEO | Login NEO, áudio, microfone, chamada, popup iframe, min/max, navegação | Comunicação funcional; permissão CSP e origem segura | gravação autorizada | NÃO EXECUTADO |
| M-026 | P1 | E-mail | Validar provedor configurado, opt-in, falha e reenvio em sandbox | Entrega só quando habilitada; sem duplicidade | logs de sandbox | NÃO EXECUTADO |
| M-027 | P1 | WhatsApp | Validar webhook, consentimento, janela, status e custos com conta de teste | Mensageria correta e conforme regras do provedor | logs de sandbox | NÃO EXECUTADO |
| M-028 | P1 | APIs | Invalidar chave, repetir webhook, simular timeout/replay e webhook de tenant B | Assinaturas, idempotência e isolamento preservados | logs sem segredos | NÃO EXECUTADO |
| M-029 | P1 | Armazenamento | Variar quota, volume, limite por tenant e alertas | Limites corretos e sem efeito cruzado | métricas do volume | NÃO EXECUTADO |
| M-030 | P1 | Expurgo | Em QA, habilitar retenção individual de prévias expiradas | Apenas alvos previstos removidos e auditados | amostra antes/depois | NÃO EXECUTADO |
| M-031 | P1 | LGPD | Exportar/corrigir/inativar registros e avaliar direitos do titular | Política consistente de retenção, trilha e privacidade | parecer responsável | NÃO EXECUTADO |
| M-032 | P2 | Produto | Gestor comercial realiza jornada sem instruções do desenvolvedor | Conclui tarefas e entende erros e métricas | entrevista e observação | NÃO EXECUTADO |
| M-033 | P2 | Produto | Vendedor recém-cadastrado conclui cinco tarefas reais | Sem necessidade de treinamento intensivo | tempo e dificuldades | NÃO EXECUTADO |
| M-034 | P2 | Suporte | Analista de atendimento registra e acompanha cinco tickets | Operação prática de protocolo e SLA | tempo e feedback | NÃO EXECUTADO |
| M-035 | P2 | Administração | Admin provisiona equipe, perfis, marca e política sem SQL | Gestão autônoma por tela | roteiro assinado | NÃO EXECUTADO |

## Registro de execução

Copiar este bloco para cada caso executado:

- **Caso:** M-___
- **Data/hora e operador:**
- **Ambiente/URL/SHA instalado:**
- **Pré-condição e dados sintéticos utilizados:**
- **Passos executados:**
- **Resultado:** PASS / FAIL / BLOCKED / NA
- **Resultado observado x esperado:**
- **Evidência protegida (caminho/link autorizado):**
- **Defeito e severidade:** P0/P1/P2; ID da issue
- **Responsável pelo reteste e aprovação:**

## Decisão formal

- **NO-GO:** qualquer P0 FAIL/BLOCKED/sem evidência; dados entre tenants expostos; recuperação não comprovada; TLS inválido; versão instalada incerta.
- **GO para piloto controlado:** automação relevante verde, casos P0 concluídos, decisão formal assinada com riscos P1/P2 avaliados.
- **GO para produção:** além do piloto, restauração integral comprovada, segurança/LGPD revisadas, monitoramento e suporte preparados; aprovação separada do responsável.
- **Atenção:** funcionalidades ainda indisponíveis não se tornam PASS; marcar BLOCKED e apontar PR/issue de dependência.
