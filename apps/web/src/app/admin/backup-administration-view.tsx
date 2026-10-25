"use client";

import {
  SaveButton,
  SaveNotice,
  useSaveFeedback,
} from "../../components/save-feedback";

import { useEffect, useState, type FormEvent } from "react";
import {
  BackupRecordSchema,
  OperationPreviewSchema,
  type BackupRecord,
  type OperationPreview,
} from "@axes/contracts";

import { apiRequest, downloadApiFile } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";
import { TenantPurgePolicyView } from "./tenant-purge-policy-view";
import { TenantStorageAllocationView } from "./tenant-storage-allocation-view";
import { TenantStorageReconciliationView } from "./tenant-storage-reconciliation-view";
import { GlobalStorageInventoryView } from "./global-storage-inventory-view";

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
  const { t } = useTranslation();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [schedule, setSchedule] = useState<Schedule>(defaults);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveFeedback = useSaveFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<OperationPreview | null>(null);
  const [reload, setReload] = useState(0);
  const [deletionTarget, setDeletionTarget] = useState<BackupRecord | null>(
    null
  );
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [acceptedDeletions, setAcceptedDeletions] = useState<string[]>([]);
  useEffect(() => {
    setDeletionTarget(null);
    setDeletionConfirmation("");
    setAcceptedDeletions([]);
  }, [accessToken]);
  const hasPendingOperations =
    acceptedDeletions.length > 0 ||
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
        const catalogBackups = BackupRecordSchema.array().parse(
          catalog.backups
        );
        setBackups(catalogBackups);
        setAcceptedDeletions(ids =>
          ids.filter(
            id =>
              !catalogBackups.some(
                item => item.id === id && item.state === "DELETED"
              )
          )
        );
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
        t("Backup solicitado (operação {0}). Atualize para acompanhar.", {
          0: result.id,
        })
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
    if (!saveFeedback.start()) return;
    try {
      const { nextRunAt: _nextRunAt, ...payload } = schedule;
      const saved = await apiRequest<Schedule>("/admin/backups/schedule", {
        accessToken,
        method: "PUT",
        body: payload,
      });
      saveFeedback.saved();
      setSchedule(saved);
    } catch (cause) {
      saveFeedback.failed();
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
      setNotice(t("Download do backup verificado iniciado."));
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
      // Keep polling even if the immediate catalog/schedule refresh fails.
      // Only a successful terminal catalog response clears this local marker.
      setAcceptedDeletions(ids =>
        Array.from(new Set([...ids, deletionTarget.id]))
      );
      setNotice(t("Exclusão solicitada. Acompanhe a conclusão no histórico."));
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
            {t("Administração · Superusuário")}
          </p>
          <h1 id="backup-title">{t("Backup e recuperação")}</h1>
          <p>
            {t("Backups isolados por empresa, criptografados e auditados.")}
          </p>
        </div>
        <button type="button" onClick={() => setReload(value => value + 1)}>
          {t("Atualizar informações")}
        </button>
      </header>

      {!configured && !loading ? (
        <p role="status">
          {t(
            "Armazenamento ainda não habilitado. Configure BACKUP_DIRECTORY e BACKUP_ENCRYPTION_KEY no servidor para ativar as operações."
          )}
        </p>
      ) : null}
      {loading ? <p>{t("Carregando histórico...")}</p> : null}
      {error ? <p role="alert">{t(error)}</p> : null}
      {notice ? <p role="status">{t(notice)}</p> : null}

      <section className="companies-view__card" aria-label={t("Backup manual")}>
        <h2>{t("Backup manual")}</h2>
        <p>
          {t(
            "A solicitação entra na fila durável e será processada pelo worker."
          )}
        </p>
        <button
          type="button"
          disabled={!configured || busy}
          onClick={() => void runBackup()}
        >
          {t("Criar backup agora")}
        </button>
      </section>

      <section
        className="companies-view__card"
        aria-label={t("Agendamento de backups")}
      >
        <h2>{t("Agendamento automático")}</h2>
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
            {t("Ativar backup automático")}
          </label>
          <label>
            {t("Frequência")}
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
              <option value="DAILY">{t("Diário")}</option>
              <option value="WEEKLY">{t("Semanal")}</option>
              <option value="INTERVAL">{t("Intervalo")}</option>
            </select>
          </label>
          {schedule.frequency === "INTERVAL" ? (
            <label>
              {t("Intervalo (minutos)")}
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
                {t("Horário (São Paulo)")}
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
                  {t("Dia da semana")}
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
            {t("Retenção (quantidade de backups)")}
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
          <p>
            {t("Próxima execução: ")}
            {date(schedule.nextRunAt)}
          </p>
          <SaveButton
            type="submit"
            disabled={busy || (schedule.enabled && !configured)}
            status={saveFeedback.status}
            label={t("Salvar agendamento")}
          />
          <SaveNotice
            status={saveFeedback.status}
            label={t("Agendamento salvo com auditoria.")}
          />
        </form>
      </section>

      <section
        className="companies-view__card"
        aria-label={t("Operações de backup")}
      >
        <h2>{t("Fila e execução")}</h2>
        {operations.length === 0 ? (
          <p>{t("Não há operações registradas.")}</p>
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
        aria-label={t("Histórico de backups")}
      >
        <h2>{t("Histórico")}</h2>
        <p>
          {t(
            "O download gera JSON sem criptografia. Guarde o arquivo em local privado e não o compartilhe por canais não autorizados."
          )}
        </p>
        {backups.length === 0 ? (
          <p>{t("Nenhum backup no catálogo.")}</p>
        ) : (
          <ul>
            {backups.map(item => (
              <li key={item.id}>
                <strong>{date(item.createdAt)}</strong> ·{" "}
                {states[item.state] ?? item.state} · {item.reason} ·{" "}
                {size(item.byteCount)}
                {item.errorCode
                  ? ` · ${item.errorCode === "BACKUP_DELETE_RETRY" ? t("A exclusão será tentada novamente.") : item.errorCode}`
                  : null}
                {item.state === "COMPLETED" ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void download(item.id)}
                    >
                      {t("Baixar")}
                    </button>{" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void viewPreview(item.id)}
                    >
                      {t("Prévia de restauração")}
                    </button>{" "}
                    <button
                      type="button"
                      disabled={busy || loading || !configured}
                      onClick={() => {
                        setDeletionTarget(item);
                        setDeletionConfirmation("");
                      }}
                    >
                      {t("Excluir backup")}
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {deletionTarget ? (
        <section
          className="companies-view__card"
          aria-label={t("Excluir backup")}
        >
          <h2>{t("Excluir backup")}</h2>
          <p>
            {t("Cópia de ")}
            {date(deletionTarget.createdAt)} · {size(deletionTarget.byteCount)}
          </p>
          <p>{deletionTarget.id}</p>
          <p>
            {t(
              "A cópia selecionada será removida do armazenamento. O histórico e a auditoria serão preservados."
            )}
          </p>
          <form onSubmit={event => void deleteBackup(event)}>
            <label>
              {t("Digite EXCLUIR BACKUP para confirmar")}
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
              {t("Confirmar exclusão")}
            </button>{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDeletionTarget(null);
                setDeletionConfirmation("");
              }}
            >
              {t("Cancelar")}
            </button>
          </form>
        </section>
      ) : null}

      {preview ? (
        <section
          className="companies-view__card"
          aria-label={t("Prévia de restauração")}
        >
          <h2>{t("Prévia validada — somente consulta")}</h2>
          <p>
            {t("Backup: ")}
            {preview.targetBackupId}
          </p>
          <p>
            {t("Versão: ")}
            {preview.targetSchemaVersion}
            {t(" · Válida até")} {date(preview.expiresAt)}
          </p>
          <p>
            {t("Estado atual:")}{" "}
            {Object.values(preview.currentCounts).reduce((a, b) => a + b, 0)}{" "}
            {t("registros.")}
          </p>
          <p>
            {t("Estado da cópia:")}{" "}
            {Object.values(preview.targetCounts).reduce((a, b) => a + b, 0)}{" "}
            {t("registros.")}
          </p>
          {preview.unsupportedRestoreModels?.length ? (
            <p role="status">
              {t("Modelos ainda não restauráveis:")}{" "}
              {preview.unsupportedRestoreModels.join(", ")}
            </p>
          ) : null}
          <p>
            {t(
              "A restauração efetiva ainda está bloqueada: exige reautenticação, cópia preventiva verificada e substituição transacional homologada."
            )}
          </p>
          <button type="button" onClick={() => setPreview(null)}>
            {t("Fechar prévia")}
          </button>
        </section>
      ) : null}
      <TenantStorageAllocationView accessToken={accessToken} />
      <TenantStorageReconciliationView accessToken={accessToken} />
      <GlobalStorageInventoryView accessToken={accessToken} />
      <TenantPurgePolicyView accessToken={accessToken} />
    </section>
  );
}
