"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  BackupRecordSchema,
  OperationPreviewSchema,
  type BackupRecord,
  type OperationPreview,
} from "@axes/contracts";

import { apiRequest, downloadApiFile } from "../../lib/api-client";

type Operation = {
  id: string;
  state: string;
  stage: string;
  processed: number;
  total: number | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Schedule = {
  enabled: boolean;
  frequency: "DAILY" | "WEEKLY" | "INTERVAL";
  localTime: string;
  weekday: number;
  intervalMinutes: number | null;
  retentionCount: 7 | 15 | 30 | 90;
  timezone: "America/Sao_Paulo";
  nextRunAt: string | null;
};

const defaults: Schedule = {
  enabled: false,
  frequency: "DAILY",
  localTime: "02:00",
  weekday: 0,
  intervalMinutes: null,
  retentionCount: 15,
  timezone: "America/Sao_Paulo",
  nextRunAt: null,
};

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function size(value: number | null): string {
  return value === null ? "—" : `${(value / 1024).toFixed(1)} KiB`;
}

const states: Record<string, string> = {
  PENDING: "Aguardando",
  RUNNING: "Executando",
  COMPLETED: "Concluído",
  FAILED: "Falhou",
  DELETING: "Exclusão pendente",
  DELETED: "Excluído",
};

export function BackupAdministrationView({
  accessToken,
}: {
  accessToken: string;
}) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [schedule, setSchedule] = useState<Schedule>(defaults);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<OperationPreview | null>(null);
  const [reload, setReload] = useState(0);
  const [deletionTarget, setDeletionTarget] = useState<BackupRecord | null>(
    null
  );
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  useEffect(() => {
    setDeletionTarget(null);
    setDeletionConfirmation("");
  }, [accessToken]);
  const hasPendingOperations =
    backups.some(item => item.state === "DELETING") ||
    operations.some(
      operation =>
        operation.state === "PENDING" || operation.state === "RUNNING"
    );

  // Refresh active operations automatically, but stop when the queue is idle.
  useEffect(() => {
    if (!hasPendingOperations || busy) return;
    const timer = setInterval(() => setReload(value => value + 1), 10_000);
    return () => clearInterval(timer);
  }, [hasPendingOperations, busy]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      apiRequest<{ configured: boolean; backups: unknown[] }>(
        "/admin/backups",
        { accessToken }
      ),
      apiRequest<Operation[]>("/admin/backups/operations", { accessToken }),
      apiRequest<Schedule>("/admin/backups/schedule", { accessToken }),
    ])
      .then(([catalog, activeOperations, settings]) => {
        if (!active) return;
        setConfigured(catalog.configured);
        setBackups(BackupRecordSchema.array().parse(catalog.backups));
        setOperations(activeOperations);
        setSchedule(settings);
      })
      .catch(cause => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o histórico de backups."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, reload]);

  async function runBackup() {
    if (!configured || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{ id: string }>("/admin/backups", {
        accessToken,
        method: "POST",
      });
      setNotice(
        `Backup solicitado (operação ${result.id}). Atualize para acompanhar.`
      );
      setReload(value => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao solicitar backup."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { nextRunAt: _nextRunAt, ...payload } = schedule;
      const saved = await apiRequest<Schedule>("/admin/backups/schedule", {
        accessToken,
        method: "PUT",
        body: payload,
      });
      setSchedule(saved);
      setNotice("Agendamento salvo com auditoria.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar agendamento."
      );
    } finally {
      setBusy(false);
    }
  }

  async function viewPreview(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const result = await apiRequest<unknown>(`/admin/backups/${id}/preview`, {
        accessToken,
        method: "POST",
      });
      setPreview(OperationPreviewSchema.parse(result));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível validar o backup."
      );
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await downloadApiFile(
        `/admin/backups/${id}/download`,
        accessToken,
        `crm-backup-${id}.json`
      );
      setNotice("Download do backup verificado iniciado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha no download.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !deletionTarget ||
      deletionConfirmation !== "EXCLUIR BACKUP" ||
      busy ||
      loading
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/admin/backups/${deletionTarget.id}`, {
        accessToken,
        method: "DELETE",
        body: {
          confirmation: deletionConfirmation,
          checksum: deletionTarget.checksum,
        },
      });
      setNotice("Exclusão solicitada. Acompanhe a conclusão no histórico.");
      setDeletionTarget(null);
      setDeletionConfirmation("");
      setPreview(null);
      setReload(value => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir o backup."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="activities-view backup-administration"
      aria-labelledby="backup-title"
    >
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">
            Administração · Superusuário
          </p>
          <h1 id="backup-title">Backup e recuperação</h1>
          <p>Backups isolados por empresa, criptografados e auditados.</p>
        </div>
        <button type="button" onClick={() => setReload(value => value + 1)}>
          Atualizar informações
        </button>
      </header>

      {!configured && !loading ? (
        <p role="status">
          Armazenamento ainda não habilitado. Configure BACKUP_DIRECTORY e
          BACKUP_ENCRYPTION_KEY no servidor para ativar as operações.
        </p>
      ) : null}
      {loading ? <p>Carregando histórico...</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      <section className="companies-view__card" aria-label="Backup manual">
        <h2>Backup manual</h2>
        <p>
          A solicitação entra na fila durável e será processada pelo worker.
        </p>
        <button
          type="button"
          disabled={!configured || busy}
          onClick={() => void runBackup()}
        >
          Criar backup agora
        </button>
      </section>

      <section
        className="companies-view__card"
        aria-label="Agendamento de backups"
      >
        <h2>Agendamento automático</h2>
        <form onSubmit={saveSchedule}>
          <label>
            <input
              type="checkbox"
              checked={schedule.enabled}
              disabled={!configured || busy}
              onChange={event =>
                setSchedule(current => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
            />
            Ativar backup automático
          </label>
          <label>
            Frequência
            <select
              value={schedule.frequency}
              disabled={busy}
              onChange={event =>
                setSchedule(current => ({
                  ...current,
                  frequency: event.target.value as Schedule["frequency"],
                  intervalMinutes:
                    event.target.value === "INTERVAL" ? 60 : null,
                }))
              }
            >
              <option value="DAILY">Diário</option>
              <option value="WEEKLY">Semanal</option>
              <option value="INTERVAL">Intervalo</option>
            </select>
          </label>
          {schedule.frequency === "INTERVAL" ? (
            <label>
              Intervalo (minutos)
              <input
                type="number"
                min={1}
                max={525600}
                value={schedule.intervalMinutes ?? 60}
                onChange={event =>
                  setSchedule(current => ({
                    ...current,
                    intervalMinutes: Number(event.target.value),
                  }))
                }
              />
            </label>
          ) : (
            <>
              <label>
                Horário (São Paulo)
                <input
                  type="time"
                  value={schedule.localTime}
                  onChange={event =>
                    setSchedule(current => ({
                      ...current,
                      localTime: event.target.value,
                    }))
                  }
                />
              </label>
              {schedule.frequency === "WEEKLY" ? (
                <label>
                  Dia da semana
                  <select
                    value={schedule.weekday}
                    onChange={event =>
                      setSchedule(current => ({
                        ...current,
                        weekday: Number(event.target.value),
                      }))
                    }
                  >
                    {[
                      "Domingo",
                      "Segunda",
                      "Terça",
                      "Quarta",
                      "Quinta",
                      "Sexta",
                      "Sábado",
                    ].map((name, index) => (
                      <option value={index} key={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}
          <label>
            Retenção (quantidade de backups)
            <select
              value={schedule.retentionCount}
              onChange={event =>
                setSchedule(current => ({
                  ...current,
                  retentionCount: Number(
                    event.target.value
                  ) as Schedule["retentionCount"],
                }))
              }
            >
              {[7, 15, 30, 90].map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <p>Próxima execução: {date(schedule.nextRunAt)}</p>
          <button
            type="submit"
            disabled={busy || (schedule.enabled && !configured)}
          >
            Salvar agendamento
          </button>
        </form>
      </section>

      <section
        className="companies-view__card"
        aria-label="Operações de backup"
      >
        <h2>Fila e execução</h2>
        {operations.length === 0 ? (
          <p>Não há operações registradas.</p>
        ) : (
          <ul>
            {operations.map(item => (
              <li key={item.id}>
                {date(item.createdAt)} · {states[item.state] ?? item.state} ·{" "}
                {item.stage}
                {item.errorCode ? ` · Erro: ${item.errorCode}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="companies-view__card"
        aria-label="Histórico de backups"
      >
        <h2>Histórico</h2>
        <p>
          O download gera JSON sem criptografia. Guarde o arquivo em local
          privado e não o compartilhe por canais não autorizados.
        </p>
        {backups.length === 0 ? (
          <p>Nenhum backup no catálogo.</p>
        ) : (
          <ul>
            {backups.map(item => (
              <li key={item.id}>
                <strong>{date(item.createdAt)}</strong> ·{" "}
                {states[item.state] ?? item.state} · {item.reason} ·{" "}
                {size(item.byteCount)}
                {item.errorCode
                  ? ` · ${item.errorCode === "BACKUP_DELETE_RETRY" ? "A exclusão será tentada novamente." : item.errorCode}`
                  : null}
                {item.state === "COMPLETED" ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void download(item.id)}
                    >
                      Baixar
                    </button>{" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void viewPreview(item.id)}
                    >
                      Prévia de restauração
                    </button>{" "}
                    <button
                      type="button"
                      disabled={busy || loading || !configured}
                      onClick={() => {
                        setDeletionTarget(item);
                        setDeletionConfirmation("");
                      }}
                    >
                      Excluir backup
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {deletionTarget ? (
        <section className="companies-view__card" aria-label="Excluir backup">
          <h2>Excluir backup</h2>
          <p>
            Cópia de {date(deletionTarget.createdAt)} ·{" "}
            {size(deletionTarget.byteCount)}
          </p>
          <p>{deletionTarget.id}</p>
          <p>
            A cópia selecionada será removida do armazenamento. O histórico e a
            auditoria serão preservados.
          </p>
          <form onSubmit={event => void deleteBackup(event)}>
            <label>
              Digite EXCLUIR BACKUP para confirmar
              <input
                value={deletionConfirmation}
                autoComplete="off"
                onChange={event => setDeletionConfirmation(event.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={
                busy || loading || deletionConfirmation !== "EXCLUIR BACKUP"
              }
            >
              Confirmar exclusão
            </button>{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDeletionTarget(null);
                setDeletionConfirmation("");
              }}
            >
              Cancelar
            </button>
          </form>
        </section>
      ) : null}

      {preview ? (
        <section
          className="companies-view__card"
          aria-label="Prévia de restauração"
        >
          <h2>Prévia validada — somente consulta</h2>
          <p>Backup: {preview.targetBackupId}</p>
          <p>
            Versão: {preview.targetSchemaVersion} · Válida até{" "}
            {date(preview.expiresAt)}
          </p>
          <p>
            Estado atual:{" "}
            {Object.values(preview.currentCounts).reduce((a, b) => a + b, 0)}{" "}
            registros.
          </p>
          <p>
            Estado da cópia:{" "}
            {Object.values(preview.targetCounts).reduce((a, b) => a + b, 0)}{" "}
            registros.
          </p>
          <p>
            A restauração efetiva ainda está bloqueada: exige reautenticação,
            cópia preventiva verificada e substituição transacional homologada.
          </p>
          <button type="button" onClick={() => setPreview(null)}>
            Fechar prévia
          </button>
        </section>
      ) : null}
    </section>
  );
}
