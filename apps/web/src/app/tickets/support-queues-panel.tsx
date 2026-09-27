"use client";

import { FormEvent, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import type { SupportQueueRecord } from "./ticket-labels";

type SupportQueuesPanelProps = {
  accessToken: string;
  queues: SupportQueueRecord[];
  onChanged: () => void;
  onClose: () => void;
};

type QueueForm = {
  name: string;
  description: string;
  isActive: boolean;
  autoAssign: boolean;
};

const emptyForm: QueueForm = {
  name: "",
  description: "",
  isActive: true,
  autoAssign: false,
};

/** C5.2 — gestão de filas de atendimento (requer `support.manage`). */
export function SupportQueuesPanel({
  accessToken,
  queues,
  onChanged,
  onClose,
}: SupportQueuesPanelProps) {
  const [form, setForm] = useState<QueueForm>(emptyForm);
  const [editing, setEditing] = useState<SupportQueueRecord | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startEdit(queue: SupportQueueRecord) {
    setEditing(queue);
    setConfirmingId(null);
    setForm({
      name: queue.name,
      description: queue.description ?? "",
      isActive: queue.isActive,
      autoAssign: queue.autoAssign,
    });
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("Informe o nome da fila.");
      return;
    }
    const description = form.description.trim();
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await apiRequest(`/support-queues/${editing.id}`, {
          accessToken,
          method: "PATCH",
          body: {
            name,
            description: description || null,
            isActive: form.isActive,
            autoAssign: form.autoAssign,
            version: editing.version,
          },
        });
      } else {
        await apiRequest("/support-queues", {
          accessToken,
          method: "POST",
          body: {
            name,
            ...(description ? { description } : {}),
            isActive: form.isActive,
            autoAssign: form.autoAssign,
          },
        });
      }
      resetForm();
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar."
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(queue: SupportQueueRecord) {
    setBusy(true);
    setError("");
    try {
      await apiRequest<void>(`/support-queues/${queue.id}`, {
        accessToken,
        method: "DELETE",
      });
      setConfirmingId(null);
      if (editing?.id === queue.id) resetForm();
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir a fila."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="company-form" aria-label="Filas de atendimento">
      <div className="company-form__heading">
        <div>
          <p>Configuração</p>
          <h2>Filas de atendimento</h2>
        </div>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>

      {error ? (
        <p className="companies-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {queues.length === 0 ? (
        <p>Nenhuma fila cadastrada.</p>
      ) : (
        <div className="company-import__table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fila</th>
                <th>Situação</th>
                <th>Distribuição</th>
                <th>Abertas</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {queues.map(queue => (
                <tr key={queue.id}>
                  <td>
                    <strong>{queue.name}</strong>
                    {queue.description ? <p>{queue.description}</p> : null}
                  </td>
                  <td>{queue.isActive ? "Ativa" : "Inativa"}</td>
                  <td>{queue.autoAssign ? "Automática" : "Manual"}</td>
                  <td>{queue.openTicketCount}</td>
                  <td className="support-queues__actions">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Editar ${queue.name}`}
                      onClick={() => startEdit(queue)}
                    >
                      Editar
                    </button>
                    {confirmingId === queue.id ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Confirmar exclusão de ${queue.name}`}
                        onClick={() => void remove(queue)}
                      >
                        Confirmar exclusão
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || queue.openTicketCount > 0}
                        title={
                          queue.openTicketCount > 0
                            ? "Há solicitações abertas nesta fila."
                            : undefined
                        }
                        aria-label={`Excluir ${queue.name}`}
                        onClick={() => setConfirmingId(queue.id)}
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        aria-label={editing ? `Editar fila ${editing.name}` : "Nova fila"}
        onSubmit={submit}
      >
        <div className="company-form__fields">
          <label>
            <span>Nome da fila</span>
            <input
              value={form.name}
              disabled={busy}
              maxLength={120}
              onChange={event =>
                setForm(current => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Descrição da fila</span>
            <input
              value={form.description}
              disabled={busy}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.isActive}
              disabled={busy}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
            />
            <span>Fila ativa</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.autoAssign}
              disabled={busy}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  autoAssign: event.target.checked,
                }))
              }
            />
            <span>Distribuir automaticamente</span>
          </label>
        </div>
        <div className="support-queues__actions">
          <button type="submit" className="button" disabled={busy}>
            {editing ? "Salvar fila" : "Criar fila"}
          </button>
          {editing ? (
            <button type="button" onClick={resetForm} disabled={busy}>
              Cancelar edição
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
