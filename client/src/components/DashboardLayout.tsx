import { useAuth } from "@/_core/hooks/useAuth";
import { initials } from "@/lib/crm";
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "./ui/button";

const navigation = [
  { label: "Visão geral", path: "/", icon: LayoutDashboard },
  { label: "Clientes", path: "/clientes", icon: Users },
  { label: "Oportunidades", path: "/oportunidades", icon: BriefcaseBusiness },
  { label: "Atividades", path: "/atividades", icon: ClipboardList },
  { label: "Interações", path: "/interacoes", icon: MessageSquare },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return <div className="min-h-screen crm-surface flex items-center justify-center"><div className="crm-loader" aria-label="Carregando" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen crm-surface flex items-center justify-center p-5">
        <section className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/85 p-9 text-center shadow-[0_28px_80px_rgba(26,35,56,0.14)] backdrop-blur">
          <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#18223a] text-white shadow-lg"><Sparkles className="h-6 w-6" /></div>
          <p className="eyebrow justify-center">CRM VENDAS</p>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[#172033]">Sua operação comercial, em foco.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-500">Acesse o ambiente seguro para centralizar clientes, negociações e atividades da sua equipe.</p>
          <Button onClick={() => setLocation("/login")} size="lg" className="mt-8 w-full rounded-xl bg-[#172033] shadow-lg shadow-slate-900/15 hover:bg-[#27365b]">Entrar no CRM</Button>
        </section>
      </div>
    );
  }

  const navItems = user.role === "admin" ? [...navigation, { label: "Auditoria", path: "/auditoria", icon: ShieldCheck }] : navigation;
  const isCurrent = (path: string) => path === "/" ? location === "/" : location.startsWith(path);

  return (
    <div className="min-h-screen crm-surface text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-slate-200/70 bg-white/80 px-4 py-5 backdrop-blur-xl lg:flex">
        <button onClick={() => setLocation("/")} className="flex items-center gap-3 px-3 text-left" aria-label="Ir para a visão geral">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#172033] text-white shadow-md shadow-slate-900/20"><Sparkles className="h-4 w-4" /></span>
          <span><strong className="font-display block text-sm font-semibold tracking-[0.14em] text-[#172033]">NEXUS</strong><small className="block text-[10px] font-medium tracking-[0.18em] text-slate-400">CRM VENDAS</small></span>
        </button>

        <nav className="mt-10 space-y-1" aria-label="Navegação principal">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Operação</p>
          {navItems.map(item => {
            const Icon = item.icon;
            return <button key={item.path} onClick={() => setLocation(item.path)} className={`crm-nav-item ${isCurrent(item.path) ? "crm-nav-item-active" : ""}`}><Icon className="h-4 w-4" /><span>{item.label}</span></button>;
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-slate-100 bg-[#f8f9fc] p-3">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e9edf8] text-xs font-bold text-[#27365b]">{initials(user.name)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-700">{user.name || "Usuário"}</p><p className="truncate text-xs text-slate-400">{user.role === "admin" ? "Administrador" : "Comercial"}</p></div></div>
          <button onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-rose-600"><LogOut className="h-3.5 w-3.5" /> Encerrar sessão</button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200/70 bg-[#fbfcfe]/85 px-5 backdrop-blur-xl lg:ml-[252px] lg:px-9">
        <div className="flex items-center gap-3 lg:hidden"><button onClick={() => setMobileMenuOpen(value => !value)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Abrir navegação"><Menu className="h-5 w-5" /></button><span className="font-display text-sm font-semibold tracking-[0.12em] text-[#172033]">NEXUS</span></div>
        <p className="hidden text-sm text-slate-400 lg:block">Operação comercial <span className="mx-2 text-slate-300">/</span> <span className="font-medium text-slate-600">{navItems.find(item => isCurrent(item.path))?.label ?? "CRM"}</span></p>
        <div className="flex items-center gap-3"><button className="relative rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Notificações"><Bell className="h-4.5 w-4.5" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#c99a4a]" /></button><div className="hidden h-7 w-px bg-slate-200 sm:block" /><div className="hidden items-center gap-2 sm:flex"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e9edf8] text-[10px] font-bold text-[#27365b]">{initials(user.name)}</span><div className="leading-tight"><p className="max-w-[130px] truncate text-xs font-semibold text-slate-700">{user.name || "Usuário"}</p><p className="text-[10px] text-slate-400">{user.role === "admin" ? "Admin" : "Comercial"}</p></div></div></div>
      </header>

      {mobileMenuOpen && <div className="fixed inset-x-3 top-[76px] z-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl lg:hidden">{navItems.map(item => { const Icon = item.icon; return <button key={item.path} onClick={() => { setLocation(item.path); setMobileMenuOpen(false); }} className={`crm-nav-item ${isCurrent(item.path) ? "crm-nav-item-active" : ""}`}><Icon className="h-4 w-4" />{item.label}</button>; })}<button onClick={logout} className="crm-nav-item mt-1 text-rose-600"><LogOut className="h-4 w-4" />Encerrar sessão</button></div>}

      <main className="mx-auto max-w-[1660px] px-5 py-7 lg:ml-[252px] lg:px-9 lg:py-9">{children}</main>
    </div>
  );
}
