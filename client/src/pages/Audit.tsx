import { useAuth } from "@/_core/hooks/useAuth";
import QueryError from "@/components/QueryError";
import { formatDateTime } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { ShieldCheck } from "lucide-react";

const actionLabel: Record<string, string> = { create: "Criou", update: "Atualizou", inactivate: "Inativou", move_stage: "Moveu etapa", complete: "Concluiu", update_status: "Atualizou status" };

export default function Audit() {
  const { user } = useAuth();
  const audit = trpc.audit.list.useQuery(undefined, { enabled: user?.role === "admin" });
  if (user?.role !== "admin") return <section className="crm-card mx-auto max-w-xl p-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-4 font-display text-2xl font-semibold text-[#172033]">Acesso restrito</p><p className="mt-2 text-sm leading-6 text-slate-500">A consulta de auditoria está disponível somente para usuários administradores.</p></section>;
  if (audit.isError) return <QueryError message="Não foi possível carregar o registro de auditoria." onRetry={() => void audit.refetch()} />;
  return <div className="space-y-7"><section><p className="eyebrow">GOVERNANÇA</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#172033]">Registro de auditoria</h1><p className="mt-2 text-sm text-slate-500">Rastreie as ações relevantes realizadas no CRM.</p></section><section className="crm-card overflow-hidden"><div className="overflow-x-auto"><table className="crm-table"><thead><tr><th>Data e hora</th><th>Responsável</th><th>Ação</th><th>Entidade</th><th>Resumo</th></tr></thead><tbody>{audit.isLoading ? <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">Carregando eventos...</td></tr> : (audit.data ?? []).length === 0 ? <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">Nenhum evento de auditoria registrado.</td></tr> : audit.data?.map(item => <tr key={item.id}><td>{formatDateTime(item.createdAt)}</td><td className="font-medium text-slate-700">{item.userName || item.userEmail || "Usuário"}</td><td><span className="crm-stage crm-stage-blue">{actionLabel[item.action] ?? item.action}</span></td><td className="capitalize">{item.entityType}</td><td>{item.summary}</td></tr>)}</tbody></table></div></section></div>;
}
