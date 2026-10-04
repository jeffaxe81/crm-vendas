"use client";
import { useState } from "react";
import {
  availableWorkspaceDestinations,
  WorkspacePreferencesSchema,
  type AuthSessionResponse,
  type WorkspacePreferences,
  type WorkspaceSection,
} from "@axes/contracts";
import { useWorkspace } from "./workspace-provider";
const labels: Record<string, string> = {
  favorites: "Favoritos",
  today: "Pendentes de hoje",
  indicators: "Indicadores comerciais",
  value: "Valor em aberto",
  pending: "Atividades pendentes",
  overdue: "Atividades atrasadas",
  undated: "Atividades sem data",
  stages: "Oportunidades por etapa",
  sales: "Vendas ganhas por mês",
};
export function WorkspaceEditor({ session }: { session: AuthSessionResponse }) {
  const w = useWorkspace();
  const [importNotice, setImportNotice] = useState("");
  if (!w) return null;
  const destinations = availableWorkspaceDestinations(session.permissions);
  function move(
    field: "homeOrder" | "dashboardOrder",
    index: number,
    amount: number
  ) {
    if (!w) return;
    const next = [...w.draft[field]];
    const target = index + amount;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    w.setDraft({ ...w.draft, [field]: next } as WorkspacePreferences);
  }
  function importLocal() {
    if (!w) return;
    try {
      const local = JSON.parse(
        localStorage.getItem(
          `crm:dashboard:v1:${session.organization.id}:${session.user.id}`
        ) ?? "null"
      );
      const parsed = WorkspacePreferencesSchema.safeParse({
        ...w.draft,
        dashboardOrder: local?.order,
        dashboardHidden: local?.hidden,
      });
      if (!parsed.success) {
        setImportNotice("Nenhum layout local válido encontrado.");
        return;
      }
      w.setDraft(parsed.data);
      setImportNotice(
        "Layout local importado no rascunho; clique Salvar preferências."
      );
    } catch {
      setImportNotice("Não foi possível ler o layout local.");
    }
  }
  return (
    <section
      className="activities-view"
      aria-labelledby="workspace-editor-title"
    >
      <h1 id="workspace-editor-title">Preferências pessoais</h1>
      <p>
        Configure sua tela inicial e seus atalhos. Salvar aplica a configuração
        a este usuário nesta organização, inclusive em outros dispositivos.
      </p>
      {w.error ? <p role="alert">{w.error}</p> : null}
      {w.message ? <p role="status">{w.message}</p> : null}
      <fieldset disabled={w.loading || w.saving} className="workspace-editor">
        <legend>Tela e navegação</legend>
        <label>
          Seção de abertura
          <select
            value={w.draft.defaultSection}
            onChange={event =>
              w.setDraft({
                ...w.draft,
                defaultSection: event.target.value as WorkspaceSection,
              })
            }
          >
            {destinations.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Favoritos (até seis)</legend>
          {destinations
            .filter(item => item.id !== "home")
            .map(item => (
              <label key={item.id} className="workspace-checkbox">
                <input
                  type="checkbox"
                  aria-label={`Favorito ${item.label}`}
                  checked={w.draft.favorites.includes(item.id)}
                  disabled={
                    !w.draft.favorites.includes(item.id) &&
                    w.draft.favorites.length >= 6
                  }
                  onChange={() =>
                    w.setDraft({
                      ...w.draft,
                      favorites: w.draft.favorites.includes(item.id)
                        ? w.draft.favorites.filter(id => id !== item.id)
                        : [...w.draft.favorites, item.id],
                    })
                  }
                />
                {item.label}
              </label>
            ))}
        </fieldset>
        {(["home", "dashboard"] as const).map(area => {
          const order =
            area === "home" ? w.draft.homeOrder : w.draft.dashboardOrder;
          const hidden =
            area === "home" ? w.draft.homeHidden : w.draft.dashboardHidden;
          return (
            <fieldset key={area}>
              <legend>
                {area === "home"
                  ? "Componentes do início"
                  : "Componentes do dashboard"}
              </legend>
              <ul className="workspace-order-list">
                {order.map((id, index) => (
                  <li key={id}>
                    <label className="workspace-checkbox">
                      <input
                        type="checkbox"
                        checked={!(hidden as string[]).includes(id)}
                        onChange={() => {
                          const nextHidden = (hidden as string[]).includes(id)
                            ? hidden.filter(value => value !== id)
                            : [...hidden, id];
                          w.setDraft({
                            ...w.draft,
                            [area === "home"
                              ? "homeHidden"
                              : "dashboardHidden"]: nextHidden,
                          } as WorkspacePreferences);
                        }}
                      />
                      Exibir {labels[id]}
                    </label>
                    <div>
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Mover ${labels[id]} para cima`}
                        onClick={() =>
                          move(
                            area === "home" ? "homeOrder" : "dashboardOrder",
                            index,
                            -1
                          )
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === order.length - 1}
                        aria-label={`Mover ${labels[id]} para baixo`}
                        onClick={() =>
                          move(
                            area === "home" ? "homeOrder" : "dashboardOrder",
                            index,
                            1
                          )
                        }
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
        <button type="button" onClick={importLocal}>
          Importar layout deste navegador
        </button>
        <button type="button" onClick={w.restoreDefaults}>
          Restaurar padrão
        </button>
        <button type="button" onClick={() => void w.save()}>
          Salvar preferências
        </button>
      </fieldset>
      {w.loading ? <p role="status">Carregando preferências...</p> : null}
      {importNotice ? <p role="status">{importNotice}</p> : null}
    </section>
  );
}
