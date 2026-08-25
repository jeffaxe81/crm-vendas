import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type LocalUser = { id: number; name: string | null; username: string | null; email: string | null; role: "admin" | "user"; isActive: "yes" | "no" };

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const status = trpc.auth.setupStatus.useQuery(undefined, { retry: false });
  const login = trpc.auth.login.useMutation();
  const bootstrap = trpc.auth.bootstrap.useMutation();
  const [form, setForm] = useState({ name: "", username: "", password: "", confirmation: "" });
  const isBootstrap = status.data?.canBootstrap === true;
  const busy = login.isPending || bootstrap.isPending || status.isLoading;

  function setField(field: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function completeAccess(user: LocalUser) {
    utils.auth.me.setData(undefined, user);
    void utils.auth.me.invalidate();
    setLocation("/");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBootstrap) {
      if (form.password !== form.confirmation) {
        toast.error("A confirmação não corresponde à senha informada.");
        return;
      }
      bootstrap.mutate(
        { name: form.name, username: form.username, password: form.password },
        { onSuccess: result => { toast.success("Administrador local configurado."); completeAccess(result.user); }, onError: error => toast.error(error.message) },
      );
      return;
    }
    login.mutate(
      { username: form.username, password: form.password },
      { onSuccess: result => completeAccess(result.user), onError: () => toast.error("Login ou senha inválidos.") },
    );
  }

  return <main className="crm-surface min-h-screen px-5 py-8 sm:px-8"><div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]"><section className="hidden lg:block"><div className="max-w-xl"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#172033] text-white shadow-lg shadow-slate-900/20"><Sparkles className="h-5 w-5" /></span><div><strong className="font-display text-lg tracking-[0.15em] text-[#172033]">AXE</strong><p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400">RELATIONSHIP</p></div></div><p className="eyebrow mt-16">ACESSO LOCAL E PROTEGIDO</p><h1 className="mt-4 font-display text-5xl font-semibold leading-[1.04] tracking-tight text-[#172033]">A operação comercial começa com clareza.</h1><p className="mt-6 max-w-lg text-base leading-7 text-slate-500">Acesse clientes, oportunidades e atividades com as credenciais próprias da sua equipe. Este ambiente não utiliza autenticação externa.</p><div className="mt-10 flex gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#4c58a8] shadow-sm"><ShieldCheck className="h-5 w-5" /></span><p className="max-w-xs text-sm leading-6 text-slate-500"><strong className="text-slate-700">Sessão protegida.</strong> Sua senha é armazenada apenas em formato protegido.</p></div></div></section><section className="mx-auto w-full max-w-md rounded-[2rem] border border-white/80 bg-white/90 p-7 shadow-[0_28px_90px_rgba(26,35,56,0.15)] backdrop-blur sm:p-9"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef0ff] text-[#4c58a8]"><KeyRound className="h-5 w-5" /></div><p className="eyebrow mt-6">{isBootstrap ? "CONFIGURAÇÃO INICIAL" : "ACESSO AO CRM"}</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[#172033]">{isBootstrap ? "Crie o administrador" : "Bem-vindo de volta"}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{isBootstrap ? "Defina as credenciais locais do primeiro administrador do CRM." : "Informe suas credenciais locais para acessar a operação comercial."}</p>{status.isError ? <div className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">Não foi possível verificar a configuração de acesso. Atualize a página e tente novamente.</div> : <form onSubmit={submit} className="mt-7 space-y-4">{isBootstrap && <label className="crm-field"><span>Nome do administrador</span><input required minLength={2} value={form.name} onChange={event => setField("name", event.target.value)} placeholder="Seu nome" autoComplete="name" /></label>}<label className="crm-field"><span>Login</span><input required minLength={3} value={form.username} onChange={event => setField("username", event.target.value)} placeholder="seu.login" autoComplete="username" /></label><label className="crm-field"><span>Senha</span><input required minLength={isBootstrap ? 10 : 1} type="password" value={form.password} onChange={event => setField("password", event.target.value)} placeholder={isBootstrap ? "Mínimo de 10 caracteres" : "Sua senha"} autoComplete={isBootstrap ? "new-password" : "current-password"} /></label>{isBootstrap && <label className="crm-field"><span>Confirmar senha</span><input required type="password" value={form.confirmation} onChange={event => setField("confirmation", event.target.value)} placeholder="Repita sua senha" autoComplete="new-password" /></label>}<button disabled={busy || status.isError} className="crm-button-primary mt-3 w-full justify-center">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</> : isBootstrap ? "Criar administrador" : "Entrar no CRM"}</button></form>}<p className="mt-7 text-center text-[11px] leading-5 text-slate-400">Acesso exclusivo por login e senha locais. Não há vínculo com autenticação da Manus.</p></section></div></main>;
}
