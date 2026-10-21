"use strict";
// GitHub Pages prototype: deliberately self-contained, no API calls, no authentication,
// no third-party tracking and no use of production or customer data.
const STORAGE_KEY="axes-crm-pages-demo-v1";
const STAGES=[{id:"qualificacao",name:"Qualificação",css:"blue"},{id:"proposta",name:"Proposta",css:"purple"},{id:"negociacao",name:"Negociação",css:"amber"},{id:"ganha",name:"Ganha",css:"green"}];
const NAV={inicio:["Visão geral","Acompanhe seus resultados e atividades em um só lugar."],oportunidades:["Oportunidades","Visualize o funil e movimente negócios entre etapas."],empresas:["Empresas","Organize as contas e acompanhe seus relacionamentos."],contatos:["Contatos","Conheça as pessoas que fazem seus negócios acontecer."],agenda:["Agenda","Planeje seus contatos e próximos compromissos."],chamados:["Chamados","Acompanhe solicitações de atendimento simuladas."],relatorios:["Relatórios","Analise indicadores e exporte exemplos de dados."],configuracoes:["Configurações","Personalize as cores desta demonstração."]};
const SAMPLE_OPPS=[
{id:101,title:"Expansão de licenças",company:"Horizonte Tecnologia",amount:48000,stage:"qualificacao",owner:"AC",age:"Hoje",color:"blue"},
{id:102,title:"Projeto de atendimento",company:"Grupo Aurora",amount:72500,stage:"qualificacao",owner:"LM",age:"Ontem",color:"purple"},
{id:103,title:"Renovação anual",company:"Solare Consultoria",amount:35600,stage:"proposta",owner:"RD",age:"Há 2 dias",color:"green"},
{id:104,title:"Migração para nuvem",company:"Norte Digital",amount:124000,stage:"proposta",owner:"AC",age:"Há 3 dias",color:"coral"},
{id:105,title:"Plataforma omnichannel",company:"Vale Serviços",amount:86500,stage:"negociacao",owner:"LM",age:"Há 4 dias",color:"blue"},
{id:106,title:"Modernização de telefonia",company:"Estrela Saúde",amount:59000,stage:"negociacao",owner:"RD",age:"Há 5 dias",color:"green"},
{id:107,title:"Ampliação de suporte",company:"Lumen Indústria",amount:31200,stage:"ganha",owner:"AC",age:"Há 6 dias",color:"purple"},
{id:108,title:"Integração de CRM",company:"Marfim Soluções",amount:44700,stage:"ganha",owner:"LM",age:"Há 1 semana",color:"coral"}
];
const COMPANIES=[
{name:"Horizonte Tecnologia",sector:"Tecnologia",location:"Florianópolis, SC",contacts:4,owner:"Ana Costa",color:"blue",status:"Cliente"},
{name:"Grupo Aurora",sector:"Serviços",location:"Curitiba, PR",contacts:7,owner:"Lucas Martins",color:"purple",status:"Prospect"},
{name:"Solare Consultoria",sector:"Consultoria",location:"São Paulo, SP",contacts:3,owner:"Rafael Dias",color:"green",status:"Cliente"},
{name:"Norte Digital",sector:"Tecnologia",location:"Joinville, SC",contacts:5,owner:"Ana Costa",color:"coral",status:"Prospect"},
{name:"Vale Serviços",sector:"Serviços",location:"Porto Alegre, RS",contacts:6,owner:"Lucas Martins",color:"blue",status:"Cliente"},
{name:"Estrela Saúde",sector:"Saúde",location:"Campinas, SP",contacts:8,owner:"Rafael Dias",color:"green",status:"Prospect"},
{name:"Lumen Indústria",sector:"Indústria",location:"Blumenau, SC",contacts:2,owner:"Ana Costa",color:"purple",status:"Cliente"},
{name:"Marfim Soluções",sector:"Tecnologia",location:"Itajaí, SC",contacts:5,owner:"Lucas Martins",color:"coral",status:"Cliente"}
];
const CONTACTS=[
{name:"Mariana Lima",role:"Gerente comercial",company:"Horizonte Tecnologia",email:"mariana.lima@example.com",initials:"ML",color:"purple"},
{name:"Carlos Pereira",role:"Diretor de operações",company:"Grupo Aurora",email:"carlos.pereira@example.com",initials:"CP",color:"blue"},
{name:"Patrícia Ribeiro",role:"Coordenação",company:"Estrela Saúde",email:"patricia.ribeiro@example.com",initials:"PR",color:"green"},
{name:"Bruno Andrade",role:"Gestor de TI",company:"Norte Digital",email:"bruno.andrade@example.com",initials:"BA",color:"coral"},
{name:"Juliana Santos",role:"Executiva de contas",company:"Solare Consultoria",email:"juliana.santos@example.com",initials:"JS",color:"purple"},
{name:"Renato Alves",role:"Diretor comercial",company:"Vale Serviços",email:"renato.alves@example.com",initials:"RA",color:"blue"}
];
const TASKS=[
{day:"22",month:"OUT",time:"09:30",title:"Reunião de alinhamento",company:"Horizonte Tecnologia",kind:"Reunião",type:"blue"},
{day:"22",month:"OUT",time:"14:00",title:"Retorno sobre proposta",company:"Norte Digital",kind:"Ligação",type:"amber"},
{day:"23",month:"OUT",time:"11:00",title:"Apresentação de solução",company:"Grupo Aurora",kind:"Reunião",type:"blue"},
{day:"26",month:"OUT",time:"15:30",title:"Acompanhamento comercial",company:"Estrela Saúde",kind:"Tarefa",type:"purple"}
];
const TICKETS=[
{id:"CH-0021",subject:"Ajuste de configuração",company:"Horizonte Tecnologia",priority:"Normal",status:"Em atendimento",age:"Hoje"},
{id:"CH-0020",subject:"Dúvida sobre relatório",company:"Grupo Aurora",priority:"Baixa",status:"Aberto",age:"Ontem"},
{id:"CH-0019",subject:"Revisão de permissões",company:"Norte Digital",priority:"Alta",status:"Em atendimento",age:"Há 2 dias"},
{id:"CH-0018",subject:"Orientação de uso",company:"Vale Serviços",priority:"Normal",status:"Resolvido",age:"Há 3 dias"}
];
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const brl=value=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(value);
const compact=value=>value>=1000000?"R$ "+(value/1000000).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mi":value>=1000?"R$ "+(value/1000).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mil":brl(value);
function validSaved(value){return Array.isArray(value)&&value.length<=100&&value.every(o=>o&&typeof o.id==="number"&&Number.isFinite(o.amount)&&o.amount>=0&&o.amount<100000000&&STAGES.some(s=>s.id===o.stage)&&typeof o.title==="string"&&o.title.length<=80&&typeof o.company==="string"&&o.company.length<=60)}
function readSaved(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null;const obj=JSON.parse(raw);return validSaved(obj.opportunities)?obj:null}catch{return null}}
const saved=readSaved();
const state={section:"inicio",search:"",opportunities:saved?.opportunities??structuredClone(SAMPLE_OPPS),accent:["#4263ec","#15866d","#a35b9b"].includes(saved?.accent)?saved.accent:"#4263ec"};
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({opportunities:state.opportunities,accent:state.accent}))}catch{/* Storage optional in the demo. */}}
function applyAccent(){document.documentElement.style.setProperty("--accent",state.accent);document.documentElement.style.setProperty("--accent-deep",{"#4263ec":"#2f49c6","#15866d":"#0a6c56","#a35b9b":"#803d7a"}[state.accent]);document.documentElement.style.setProperty("--accent-light",{"#4263ec":"#edf1ff","#15866d":"#e7f5ef","#a35b9b":"#f8eff8"}[state.accent])}
function match(text){return !state.search||String(text).toLocaleLowerCase("pt-BR").includes(state.search.toLocaleLowerCase("pt-BR"))}
function matchingOpps(){return state.opportunities.filter(o=>match([o.title,o.company,o.stage].join(" ")))}
function sum(list){return list.reduce((total,x)=>total+x.amount,0)}
function cardBadge(text,cls){return '<span class="chip '+cls+'">'+escapeHtml(text)+'</span>'}
function sectionHeader(title,desc,extras=""){return '<div class="section-top"><div><p class="eyebrow">ESPAÇO DE TRABALHO / DEMONSTRAÇÃO</p><h1>'+escapeHtml(title)+'</h1><p class="section-description">'+escapeHtml(desc)+'</p></div><div class="section-tools">'+extras+'</div></div>'}
function buttonLink(section,text){return '<button class="panel-link" data-go="'+section+'">'+text+' →</button>'}
function avatar(initials){return '<span class="small-avatar">'+escapeHtml(initials)+'</span>'}
function empty(label="Nenhum resultado para a pesquisa."){return '<div class="empty-state"><strong>Nada por aqui</strong>'+escapeHtml(label)+'</div>'}
function stat(label,value,note,icon,cls=""){return '<article class="stat-card"><div class="stat-card-head"><div class="stat-label">'+label+'</div><div class="stat-icon '+cls+'">'+icon+'</div></div><h2>'+value+'</h2><div class="stat-note">'+note+'</div></article>'}
function home(){
const all=matchingOpps(),won=all.filter(o=>o.stage==="ganha"),pending=all.filter(o=>o.stage!=="ganha");const total=sum(all);
const chartData=[[31,47],[42,56],[38,60],[51,69],[55,76],[62,86],[54,81]];
const chart='<div class="chart-bars">'+chartData.map(([a,b])=>'<div class="chart-group"><div class="bar" style="height:'+a+'%"></div><div class="bar primary" style="height:'+b+'%"></div></div>').join("")+'</div><div class="month-labels">'+["Abr","Mai","Jun","Jul","Ago","Set","Out"].map(x=>'<span>'+x+'</span>').join("")+'</div><div class="chart-legend"><span><i class="legend-dot"></i>Meta demonstrativa</span><span><i class="legend-dot primary"></i>Resultado demonstrativo</span></div>';
const totals=STAGES.map(s=>({name:s.name,count:all.filter(o=>o.stage===s.id).length,amount:sum(all.filter(o=>o.stage===s.id))}));
const bars='<div class="pipeline-lines">'+totals.map((s,i)=>'<div><div class="progress-row-head"><span>'+escapeHtml(s.name)+' <small>('+s.count+')</small></span><strong>'+compact(s.amount)+'</strong></div><div class="progress-track"><div class="progress-fill '+["","blue2","amber","green"][i]+'" style="width:'+Math.max(5,total?Math.round(s.amount/total*100):0)+'%"></div></div></div>').join("")+'</div>';
const activities=[["◎","Nova oportunidade em análise","Equipe Comercial · Há 15 min"],["◫","Proposta comercial revisada","Norte Digital · Há 2 horas"],["✓","Negócio avançou no funil","Vale Serviços · Ontem"],["▤","Contato atualizado","Grupo Aurora · Ontem"]];
const latest=all.slice(0,3).map(o=>'<div class="mini-deal"><div class="company-letter '+escapeHtml(o.color)+'">'+escapeHtml(o.company.slice(0,1))+'</div><div class="mini-deal-details"><strong>'+escapeHtml(o.title)+'</strong><small>'+escapeHtml(o.company)+'</small></div><span class="mini-deal-price">'+compact(o.amount)+'</span></div>').join("");
return sectionHeader("Bom dia, demonstrador 👋","Esta é uma visão de exemplo. Os indicadores abaixo não representam dados reais.",'<span class="period-picker">◷ &nbsp; Visão demonstrativa · Outubro</span>')+
'<div class="stat-grid">'+stat("Volume do funil",compact(total),'<span class="growth">↗ Exemplo</span> · valor agregado','↗')+stat("Negócios em aberto",String(pending.length),"Oportunidades no funil","◫")+stat("Vendas concluídas",compact(sum(won)),"Negócios em etapa ganha","✓","success")+stat("Compromissos",String(TASKS.length),"Próximos eventos de exemplo","▣","warn")+'</div>'+
'<div class="stack"><section class="panel"><div class="panel-head"><h2>Visão de desempenho</h2>'+buttonLink("relatorios","Ver relatórios")+'</div><p class="panel-sub">Valores meramente ilustrativos, sem integração com dados reais</p>'+chart+'</section><section class="panel"><div class="panel-head"><h2>Funil por etapa</h2>'+buttonLink("oportunidades","Abrir funil")+'</div>'+bars+'</section></div><div class="section-spacer"></div>'+
'<div class="stack stack-even"><section class="panel"><div class="panel-head"><h2>Movimentações recentes</h2><small>Atividade simulada</small></div><div class="activity-list">'+activities.map(a=>'<div class="activity-item"><div class="activity-bubble">'+a[0]+'</div><div><strong>'+a[1]+'</strong><span>'+a[2]+'</span></div></div>').join("")+'</div></section><section class="panel"><div class="panel-head"><h2>Oportunidades em destaque</h2>'+buttonLink("oportunidades","Ver todas")+'</div><div class="mini-deals">'+(latest||empty())+'</div></section></div>';
}
function opportunities(){
const all=matchingOpps();
const columns=STAGES.map(s=>{const deals=all.filter(o=>o.stage===s.id);return '<div class="board-col" data-drop="'+s.id+'"><div class="board-col-head"><span class="stage-dot '+s.id+'"></span>'+escapeHtml(s.name)+'<span class="stage-count">'+deals.length+'</span></div>'+ (deals.length?deals.map(o=>'<article class="board-card" draggable="true" data-id="'+o.id+'"><small>'+escapeHtml(o.age||"Agora")+'</small><h3>'+escapeHtml(o.title)+'</h3><div class="deal-company">'+escapeHtml(o.company)+'</div><div class="deal-price">'+brl(o.amount)+'</div><div class="board-card-footer">'+avatar(o.owner||"DV")+'<select data-move="'+o.id+'" aria-label="Mover '+escapeHtml(o.title)+' para outra etapa">'+STAGES.map(st=>'<option value="'+st.id+'" '+(o.stage===st.id?"selected":"")+'>'+st.name+'</option>').join("")+'</select></div></article>').join(""):'<div class="board-empty">Arraste um negócio para cá</div>')+'</div>'}).join("");
const extras='<button class="secondary-btn" data-action="reset">Restaurar demo</button><button class="primary-btn" data-action="create">＋ Novo negócio</button>';
return sectionHeader("Funil de oportunidades","Arraste os cartões entre etapas ou altere pelo seletor. A simulação é local.",extras)+'<div class="board-summary"><div class="summary-pill">Oportunidades <strong>'+all.length+'</strong></div><div class="summary-pill">Valor total <strong>'+compact(sum(all))+'</strong></div><div class="summary-pill">Fechadas <strong>'+all.filter(o=>o.stage==="ganha").length+'</strong></div></div><div class="board">'+columns+'</div>';
}
function companies(){
const rows=COMPANIES.filter(c=>match([c.name,c.sector,c.location,c.owner].join(" ")));
return sectionHeader("Empresas","Cadastros fictícios para avaliação do módulo comercial.",cardBadge(rows.length+" empresas","blue"))+'<div class="table-panel panel"><div class="table-toolbar"><h2>Carteira de empresas</h2><small>Apenas demonstração</small></div><div class="table-scroller"><table><thead><tr><th>Empresa</th><th>Setor</th><th>Localização</th><th>Contatos</th><th>Responsável</th><th>Situação</th></tr></thead><tbody>'+rows.map(c=>'<tr><td><span class="cell-main"><span class="company-letter '+c.color+'">'+escapeHtml(c.name[0])+'</span><strong>'+escapeHtml(c.name)+'</strong></span></td><td>'+escapeHtml(c.sector)+'</td><td>'+escapeHtml(c.location)+'</td><td>'+c.contacts+'</td><td>'+escapeHtml(c.owner)+'</td><td>'+cardBadge(c.status,c.status==="Cliente"?"green":"blue")+'</td></tr>').join("")+'</tbody></table></div>'+(rows.length?"":empty())+'</div>';
}
function contacts(){
const rows=CONTACTS.filter(c=>match([c.name,c.role,c.company,c.email].join(" ")));
return sectionHeader("Contatos","Pessoas e relacionamentos comerciais fictícios.",cardBadge(rows.length+" contatos","blue"))+'<div class="table-panel panel"><div class="table-toolbar"><h2>Todos os contatos</h2><small>Endereços @example.com sem entrega real</small></div><div class="table-scroller"><table><thead><tr><th>Contato</th><th>Empresa</th><th>E-mail fictício</th><th>Última interação</th></tr></thead><tbody>'+rows.map((c,i)=>'<tr><td><div class="cell-main">'+avatar(c.initials)+'<div><strong>'+escapeHtml(c.name)+'</strong><span class="cell-sub">'+escapeHtml(c.role)+'</span></div></div></td><td>'+escapeHtml(c.company)+'</td><td>'+escapeHtml(c.email)+'</td><td>Há '+(i+1)+' dias</td></tr>').join("")+'</tbody></table></div>'+(rows.length?"":empty())+'</div>';
}
function agenda(){
const rows=TASKS.filter(t=>match([t.title,t.company,t.kind,t.time].join(" ")));
return sectionHeader("Agenda comercial","Compromissos exemplificativos para avaliar o fluxo de navegação.",'<span class="period-picker">▣ &nbsp; Outubro de 2026</span>')+'<div class="panel"><div class="panel-head"><h2>Próximos compromissos</h2><small>Horário ilustrativo</small></div><div class="agenda-list">'+(rows.map(t=>'<article class="agenda-event"><div class="event-date"><strong>'+t.day+'</strong><small>'+t.month+'</small></div><div><h3>'+escapeHtml(t.title)+'</h3><p>'+escapeHtml(t.company)+' · '+t.time+'</p></div>'+cardBadge(t.kind,t.type)+'</article>').join("")||empty())+'</div></div>';
}
function tickets(){
const rows=TICKETS.filter(t=>match([t.subject,t.company,t.id,t.status].join(" ")));
return sectionHeader("Chamados","Exemplo de acompanhamento de atendimento e solicitações.",cardBadge(rows.filter(t=>t.status!=="Resolvido").length+" pendentes","amber"))+'<div class="table-panel panel"><div class="table-toolbar"><h2>Fila de atendimento</h2><small>Sem SLA ou integrações reais</small></div><div class="table-scroller"><table><thead><tr><th>Chamado</th><th>Assunto</th><th>Empresa</th><th>Prioridade</th><th>Status</th><th>Atualização</th></tr></thead><tbody>'+rows.map(t=>'<tr><td><strong>'+t.id+'</strong></td><td><strong>'+escapeHtml(t.subject)+'</strong></td><td>'+escapeHtml(t.company)+'</td><td>'+cardBadge(t.priority,t.priority==="Alta"?"red":t.priority==="Baixa"?"gray":"amber")+'</td><td>'+cardBadge(t.status,t.status==="Resolvido"?"green":t.status==="Aberto"?"gray":"blue")+'</td><td>'+t.age+'</td></tr>').join("")+'</tbody></table></div>'+(rows.length?"":empty())+'</div>';
}
function reports(){
const all=matchingOpps(),byStage=STAGES.map(s=>({name:s.name,items:all.filter(o=>o.stage===s.id)}));
const rows=byStage.map(s=>'<tr><td><strong>'+escapeHtml(s.name)+'</strong></td><td>'+s.items.length+'</td><td><strong>'+brl(sum(s.items))+'</strong></td><td>'+ (all.length?Math.round(100*s.items.length/all.length):0)+'%</td></tr>').join("");
return sectionHeader("Relatórios gerenciais","Indicadores gerados exclusivamente a partir dos negócios fictícios da demo.",'<button class="primary-btn" data-action="csv">↓ Exportar CSV de exemplo</button>')+
'<div class="stat-grid">'+stat("Valor do funil",compact(sum(all)),"Total estimado","▥")+stat("Negócios",String(all.length),"Registros de demonstração","◫")+stat("Taxa de ganho",all.length?Math.round(all.filter(o=>o.stage==="ganha").length/all.length*100)+"%":"0%","Por quantidade de negócios","✓","success")+stat("Valor médio",all.length?compact(sum(all)/all.length):"R$ 0","Ticket médio ilustrativo","↗")+'</div>'+
'<div class="panel table-panel"><div class="table-toolbar"><h2>Consolidado por etapa</h2><small>Dados simulados</small></div><div class="table-scroller"><table><thead><tr><th>Etapa</th><th>Quantidade</th><th>Valor total</th><th>Distribuição</th></tr></thead><tbody>'+rows+'</tbody></table></div></div><div class="section-spacer"></div><div class="security-message">ⓘ O CSV é montado no próprio navegador. Nenhum dado é enviado para servidores ou sistemas externos.</div>';
}
function settings(){
const colors=[["#4263ec","Azul"],["#15866d","Verde"],["#a35b9b","Violeta"]];
return sectionHeader("Configurações da demonstração","Personalize a aparência e redefina a simulação quando desejar.")+
'<div class="settings-stack"><section class="panel"><div class="panel-head"><h2>Identidade visual</h2>'+cardBadge("White-label ilustrativo","blue")+'</div><div class="settings-line"><div><strong>Espaço de trabalho</strong><small>Empresa Exemplo · ambiente fictício</small></div>'+cardBadge("Protótipo","gray")+'</div><div class="settings-line"><div><strong>Cor principal</strong><small>Ajuste de aparência salvo somente neste navegador</small></div><div class="theme-colors">'+colors.map(([hex,label])=>'<button class="theme-swatch '+(state.accent===hex?"active":"")+'" style="background:'+hex+'" data-accent="'+hex+'" aria-label="Cor '+label+'" title="'+label+'"></button>').join("")+'</div></div><div class="settings-line"><div><strong>Idioma</strong><small>Interface demonstrativa em português do Brasil</small></div>'+cardBadge("pt-BR","blue")+'</div></section>'+
'<section class="panel"><div class="panel-head"><h2>Proteção de dados</h2>'+cardBadge("Sem conexão","green")+'</div><div class="security-message">✓ Esta demonstração não autentica usuários, não consulta o CRM real, não envia alterações à API e não acessa PostgreSQL. Todos os cadastros e indicadores exibidos são fictícios.</div><div class="settings-line"><div><strong>Recomeçar demonstração</strong><small>Apaga apenas mudanças locais no funil e nas cores</small></div><button class="secondary-btn" data-action="reset">Reiniciar</button></div><div class="settings-line"><div><strong>Backup e restauração</strong><small>Indisponíveis na prototipagem por segurança</small></div>'+cardBadge("Desativado","gray")+'</div></section></div>';
}
const renderers={inicio:home,oportunidades,empresas,contatos,agenda,chamados,relatorios,configuracoes};
function render(){
const entry=NAV[state.section]||NAV.inicio;
$("breadcrumb-label").textContent=entry[0];
document.querySelectorAll("[data-section]").forEach(el=>{const active=el.dataset.section===state.section;el.classList.toggle("selected",active);if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current")});
$("opportunity-nav-count").textContent=state.opportunities.length;
$("page-content").innerHTML=(renderers[state.section]||home)();
applyAccent();
}
function navigate(section){if(!NAV[section])return;state.section=section;state.search="";$("global-search").value="";$("sidebar").classList.remove("open");$("mobile-shade").classList.remove("visible");render();window.scrollTo({top:0,behavior:"auto"})}
function notify(message){const el=$("toast");el.textContent=message;el.classList.add("visible");clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.classList.remove("visible"),3400)}
function resetDemo(){state.opportunities=structuredClone(SAMPLE_OPPS);state.accent="#4263ec";persist();render();notify("Dados de demonstração restaurados.")}
function modal(open){$("modal-shade").hidden=!open;if(open){$("create-form").reset();setTimeout(()=>$("create-form").elements.title.focus(),0)}else $("top-create").focus()}
function updateStage(id,stage){if(!STAGES.some(s=>s.id===stage))return;const opp=state.opportunities.find(o=>o.id===Number(id));if(!opp||opp.stage===stage)return;opp.stage=stage;opp.age="Agora";persist();render();notify('Negócio movido para "'+STAGES.find(s=>s.id===stage).name+'".')}
function csv(){const data=[["ID","Oportunidade","Empresa","Etapa","Valor (BRL)"],...matchingOpps().map(o=>[o.id,o.title,o.company,STAGES.find(s=>s.id===o.stage)?.name||o.stage,o.amount])];const escaped=data.map(row=>row.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(";")).join("\r\n");const b=new Blob(["\ufeff"+escaped],{type:"text/csv;charset=utf-8"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="crm-vendas-dados-ficticios.csv";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(u);notify("CSV demonstrativo gerado no navegador.")}
document.addEventListener("click",event=>{
const nav=event.target.closest("[data-section]");if(nav){navigate(nav.dataset.section);return}
const go=event.target.closest("[data-go]");if(go){navigate(go.dataset.go);return}
const action=event.target.closest("[data-action]");if(action){const type=action.dataset.action;if(type==="reset")resetDemo();if(type==="create")modal(true);if(type==="csv")csv();return}
const accent=event.target.closest("[data-accent]");if(accent){state.accent=accent.dataset.accent;persist();render();notify("Cor do protótipo atualizada.")}
});
document.addEventListener("change",event=>{if(event.target.matches("[data-move]"))updateStage(event.target.dataset.move,event.target.value)});
document.addEventListener("dragstart",event=>{const card=event.target.closest(".board-card");if(!card)return;event.dataTransfer.setData("text/plain",card.dataset.id);event.dataTransfer.effectAllowed="move";card.classList.add("dragging")});
document.addEventListener("dragend",event=>{event.target.closest(".board-card")?.classList.remove("dragging");document.querySelectorAll(".drag-over").forEach(el=>el.classList.remove("drag-over"))});
document.addEventListener("dragover",event=>{const col=event.target.closest("[data-drop]");if(!col)return;event.preventDefault();col.classList.add("drag-over")});
document.addEventListener("dragleave",event=>{const col=event.target.closest("[data-drop]");if(col&&!col.contains(event.relatedTarget))col.classList.remove("drag-over")});
document.addEventListener("drop",event=>{const col=event.target.closest("[data-drop]");if(!col)return;event.preventDefault();const id=event.dataTransfer.getData("text/plain");if(/^\d+$/.test(id))updateStage(id,col.dataset.drop);document.querySelectorAll(".drag-over").forEach(el=>el.classList.remove("drag-over"))});
$("global-search").addEventListener("input",event=>{state.search=event.target.value.trim().slice(0,100);render()});
$("top-create").addEventListener("click",()=>modal(true));
$("modal-close").addEventListener("click",()=>modal(false));
$("modal-cancel").addEventListener("click",()=>modal(false));
$("modal-shade").addEventListener("click",event=>{if(event.target===$("modal-shade"))modal(false)});
$("create-form").addEventListener("submit",event=>{event.preventDefault();const values=new FormData(event.target),title=String(values.get("title")||"").trim(),company=String(values.get("company")||"").trim(),stage=String(values.get("stage")||""),amount=Number(values.get("amount"));if(!title||title.length>80||!company||company.length>60||!STAGES.some(s=>s.id===stage)||!Number.isFinite(amount)||amount<0||amount>99999999){notify("Revise os campos do novo negócio.");return}if(state.opportunities.length>=100){notify("Limite de 100 oportunidades na demonstração.");return}const nextId=Math.max(100,...state.opportunities.map(o=>o.id))+1;state.opportunities.unshift({id:nextId,title,company,stage,amount,owner:"DV",age:"Agora",color:"blue"});persist();modal(false);navigate("oportunidades");notify("Oportunidade de demonstração criada.")});
$("reset-top").addEventListener("click",resetDemo);
$("sidebar-toggle").addEventListener("click",()=>{$("sidebar").classList.toggle("open");$("mobile-shade").classList.toggle("visible")});
$("mobile-shade").addEventListener("click",()=>{$("sidebar").classList.remove("open");$("mobile-shade").classList.remove("visible")});
$("brand-home").addEventListener("click",event=>{event.preventDefault();navigate("inicio")});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){if(!$("modal-shade").hidden)modal(false);$("sidebar").classList.remove("open");$("mobile-shade").classList.remove("visible")}if(event.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)){event.preventDefault();$("global-search").focus()}});
$("today-indicator").textContent=new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short",year:"numeric"}).format(new Date());
render();