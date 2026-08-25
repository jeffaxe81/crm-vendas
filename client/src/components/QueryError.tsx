import { AlertCircle, RefreshCw } from "lucide-react";

export default function QueryError({ message = "Não foi possível carregar estes dados.", onRetry }: { message?: string; onRetry?: () => void }) {
  return <div className="crm-card flex min-h-48 flex-col items-center justify-center p-8 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-500"><AlertCircle className="h-5 w-5" /></span><p className="mt-4 text-sm font-semibold text-slate-700">Algo não saiu como esperado</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">{message}</p>{onRetry && <button onClick={onRetry} className="crm-button-secondary mt-4 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Tentar novamente</button>}</div>;
}
