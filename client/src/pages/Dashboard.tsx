import QueryError from "@/components/QueryError";
import { formatCurrency, formatDate, formatDateTime, stageMeta } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowUpRight, BriefcaseBusiness, CalendarDays, ChevronRight, CircleDollarSign, Plus, Target, Users } from "lucide-react";
import { useLocation } from "wouter";

function MetricCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string | number; detail: string; icon: typeof Users; accent: string }) {
  return <article className="crm-card group p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-400">{label}</p><p className="mt-3 font-display text-3xl font-semibold tracking-tight text-[#172033]">{value}</p><p className="mt-2 text-xs text-slate-400">{detail}</p></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}><Icon className="h-4.5 w-4.5" /></span></div></article>;
}

export default function Dashboard() {
  const dashboard = trpc.dashboard.get.useQuery();
  const { data, isLoading } = dashboard;
  const [, setLocation] = useLocation();
  if (dashboard.isError) return <QueryError message="Não foi possível carregar o painel comercial." onRetry={() => void dashboard.refetch()} />;
  const pipeline = data?.pipeline ?? [];
  const stageTotal = (stage: string) => pipeline.find(item => item.stage === stage);

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow">PAINEL COMERCIAL</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#172033] md:text-[2.1rem]">Uma visão clara do que importa.</h1><p className="mt-2 text-sm text-slate-500">Acompanhe o pulso da operação e mantenha cada negociação em movimento.</p></div><div className="flex flex-wrap gap-3"><button onClick={() => setLocation("/atividades")} className="crm-button-secondary"><CalendarDays className="h-4 w-4" /> Nova atividade</button><button onClick={() => setLocation("/oportunidades")} className="crm-button-primary"><Plus className="h-4 w-4" /> Nova oportunidade</button></div></section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pipeline em aberto" value={isLoading ? "—" : formatCurrency(data?.metrics.openPipelineValue)} detail={`${data?.metrics.openOpportunities ?? 0} oportunidades ativas`} icon={CircleDollarSign} accent="bg-[#eef0ff] text-[#4c58a8]" />
        <MetricCard label="Clientes ativos" value={isLoading ? "—" : data?.metrics.activeClients ?? 0} detail="Base comercial atual" icon={Users} accent="bg-[#edf7f4] text-[#247260]" />
        <MetricCard label="Atividades pendentes" value={isLoading ? "—" : data?.metrics.pendingActivities ?? 0} detail="Na sua agenda" icon={Activity} accent="bg-[#fff5e9] text-[#b87d28]" />
        <MetricCard label="Ciclo em curso" value={isLoading ? "—" : data?.metrics.openOpportunities ?? 0} detail="Negociações a conduzir" icon={Target} accent="bg-[#f7eefb] text-[#8e56a4]" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
        <article className="crm-card p-6"><div className="flex items-start justify-between"><div><p className="eyebrow">PIPELINE</p><h2 className="mt-2 font-display text-xl font-semibold text-[#172033]">Distribuição do funil</h2></div><button onClick={() => setLocation("/oportunidades")} className="flex items-center gap-1 text-xs font-semibold text-[#4c58a8] hover:text-[#172033]">Ver funil <ArrowUpRight className="h-3.5 w-3.5" /></button></div><div className="mt-7 space-y-5">{["prospecting", "qualification", "proposal", "negotiation", "won"].map(stage => { const meta = stageMeta(stage); const item = stageTotal(stage); const proportion = Math.min((Number(item?.value ?? 0) / Math.max(Number(data?.metrics.openPipelineValue ?? 0), 1)) * 100, 100); return <div key={stage}><div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-slate-600">{meta.label}</span><span className="text-slate-400">{item?.quantity ?? 0} oportunidades <b className="ml-2 font-semibold text-slate-600">{formatCurrency(item?.value)}</b></span></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full crm-bar-${meta.tone}`} style={{ width: `${proportion}%` }} /></div></div>; })}</div></article>

        <article className="crm-card p-6"><div className="flex items-start justify-between"><div><p className="eyebrow">AGENDA</p><h2 className="mt-2 font-display text-xl font-semibold text-[#172033]">Prioridades de hoje</h2></div><button onClick={() => setLocation("/atividades")} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><ChevronRight className="h-5 w-5" /></button></div><div className="mt-6 divide-y divide-slate-100">{(data?.myActivities ?? []).length === 0 ? <div className="py-10 text-center"><CalendarDays className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-500">Agenda organizada</p><p className="mt-1 text-xs text-slate-400">Nenhuma pendência por enquanto.</p></div> : data?.myActivities.map(item => <div key={item.id} className="flex gap-3 py-3.5"><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#c99a4a]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-700">{item.title}</p><p className="mt-1 truncate text-xs text-slate-400">{item.clientName ?? item.opportunityTitle ?? "Atividade comercial"}</p></div><span className="shrink-0 text-[11px] font-medium text-slate-400">{formatDate(item.dueAt)}</span></div>)}</div></article>
      </section>

      <section className="crm-card overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><p className="eyebrow">MOVIMENTAÇÃO</p><h2 className="mt-1 font-display text-xl font-semibold text-[#172033]">Oportunidades recentes</h2></div><button onClick={() => setLocation("/oportunidades")} className="crm-button-secondary text-xs">Ver todas</button></div><div className="overflow-x-auto"><table className="crm-table"><thead><tr><th>Oportunidade</th><th>Cliente</th><th>Etapa</th><th>Valor estimado</th><th>Atualização</th></tr></thead><tbody>{(data?.recentOpportunities ?? []).length === 0 ? <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">As oportunidades aparecerão aqui quando forem registradas.</td></tr> : data?.recentOpportunities.map(item => { const meta = stageMeta(item.stage); return <tr key={item.id}><td className="font-semibold text-slate-700">{item.title}</td><td>{item.clientName}</td><td><span className={`crm-stage crm-stage-${meta.tone}`}>{meta.label}</span></td><td className="font-semibold text-slate-600">{formatCurrency(item.estimatedValue)}</td><td>{formatDateTime(item.updatedAt)}</td></tr>; })}</tbody></table></div></section>
    </div>
  );
}
