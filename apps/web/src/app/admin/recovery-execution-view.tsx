"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { OperationPreviewSchema, type OperationPreview } from "@axes/contracts";
import { apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";

type Capabilities = {
  enabled: boolean;
  configured: boolean;
  confirmationPhrases: { restore: string; delete: string };
  maxPreviewAgeSeconds: number;
};
type Receipt = {
  id: string;
  kind: "RESTORE" | "DELETE";
  state: string;
  preventiveBackupId: string | null;
  targetBackupId: string | null;
  createdAt: string;
  completedAt: string | null;
  stage?: string;
  errorCode?: string | null;
};
type Props = { accessToken: string; preview: OperationPreview | null };

export function RecoveryExecutionView(props: Props) {
  return <RecoverySession key={props.accessToken} {...props} />;
}

function RecoverySession({ accessToken, preview }: Props) {
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [deletionPreview, setDeletionPreview] =
    useState<OperationPreview | null>(null);
  const [history, setHistory] = useState<Receipt[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    void apiRequest<Capabilities>("/admin/recovery/capabilities", {
      accessToken,
    })
      .then(value => {
        if (active.current) setCapabilities(value);
      })
      .catch(() => {
        if (active.current)
          setError(t("Não foi possível carregar a recuperação protegida."));
      });
    return () => {
      active.current = false;
    };
  }, [accessToken, t]);
  const enabled =
    capabilities?.enabled === true && capabilities.configured === true;

  async function deletion() {
    if (!enabled || pending.current || receipt) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setDeletionPreview(null);
    try {
      const value = OperationPreviewSchema.parse(
        await apiRequest("/admin/recovery/delete/preview", {
          accessToken,
          method: "POST",
        })
      );
      if (value.kind !== "DELETE" || value.targetBackupId !== null)
        throw Error();
      if (active.current) setDeletionPreview(value);
    } catch {
      if (active.current)
        setError(t("Não foi possível preparar a prévia de exclusão."));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function execute(
    selected: OperationPreview,
    password: string,
    confirmation: string
  ) {
    if (!enabled || pending.current || receipt) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<Receipt>(
        `/admin/recovery/${selected.kind === "RESTORE" ? "restore" : "delete"}`,
        {
          accessToken,
          method: "POST",
          body: { previewId: selected.id, password, confirmation },
        }
      );
      if (active.current) setReceipt(result);
    } catch {
      if (active.current)
        setError(
          t(
            "A operação não foi confirmada. Confira o histórico antes de tentar novamente."
          )
        );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function loadHistory() {
    if (pending.current || receipt) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<Receipt[]>("/admin/recovery/operations", {
        accessToken,
      });
      if (active.current) setHistory(result);
    } catch {
      if (active.current)
        setError(t("Não foi possível carregar o histórico de recuperação."));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  return (
    <section
      className="companies-view__card"
      aria-label={t("Recuperação protegida")}
    >
      <h2>{t("Recuperação protegida")}</h2>
      {!enabled && (
        <p role="status">
          {t(
            "Restauração e exclusão operacional pendentes de homologação e configuração. Execução indisponível."
          )}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {receipt ? (
        <div role="status">
          <h3>{t("Operação concluída")}</h3>
          <p>
            {t("Comprovante da operação:")} {receipt.id} · {receipt.kind} ·{" "}
            {receipt.state}
          </p>
          <p>
            {t("Backup preventivo:")} {receipt.preventiveBackupId}
          </p>
          <p>
            {t("Backup de destino:")} {receipt.targetBackupId ?? "—"}
          </p>
          <p>{receipt.completedAt}</p>
          <p>
            {t("As sessões foram encerradas. Entre novamente para continuar.")}
          </p>
        </div>
      ) : (
        <>
          {enabled && (
            <>
              <p>
                {t(
                  "A operação cria uma cópia preventiva verificada e encerra as sessões da empresa."
                )}
              </p>
              {preview && (
                <RecoveryConfirmation
                  key={`restore-${preview.id}`}
                  preview={preview}
                  kind="RESTORE"
                  capabilities={capabilities}
                  busy={busy}
                  execute={execute}
                />
              )}
              <p>
                {t(
                  "Excluir dados operacionais remove também os dados comerciais da empresa. Revise todas as contagens antes de confirmar."
                )}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void deletion()}
              >
                {t("Preparar prévia de exclusão operacional")}
              </button>
              {deletionPreview && (
                <RecoveryConfirmation
                  key={`${deletionPreview.id}-${preview?.id ?? "none"}`}
                  preview={deletionPreview}
                  kind="DELETE"
                  capabilities={capabilities}
                  busy={busy}
                  execute={execute}
                />
              )}
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadHistory()}
          >
            {t("Consultar histórico de recuperação")}
          </button>
          <ul>
            {history.map(item => (
              <li key={item.id}>
                {item.id} · {item.kind} · {item.state} · {item.stage} ·{" "}
                {item.errorCode} · {item.createdAt} · {item.completedAt} ·{" "}
                {item.preventiveBackupId}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function RecoveryConfirmation({
  preview,
  kind,
  capabilities,
  busy,
  execute,
}: {
  preview: OperationPreview;
  kind: "RESTORE" | "DELETE";
  capabilities: Capabilities;
  busy: boolean;
  execute: (
    preview: OperationPreview,
    password: string,
    confirmation: string
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const phrase =
    kind === "RESTORE"
      ? capabilities.confirmationPhrases.restore
      : capabilities.confirmationPhrases.delete;
  const valid =
    preview.kind === kind &&
    (kind === "RESTORE"
      ? Boolean(preview.targetBackupId) &&
        !preview.unsupportedRestoreModels?.length
      : preview.targetBackupId === null);
  const fresh =
    Date.parse(preview.expiresAt) > now &&
    Date.parse(preview.createdAt) + capabilities.maxPreviewAgeSeconds * 1000 >
      now;
  const ready =
    valid && fresh && password.length > 0 && confirmation === phrase && !busy;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !ready ||
      Date.parse(preview.expiresAt) <= Date.now() ||
      Date.parse(preview.createdAt) +
        capabilities.maxPreviewAgeSeconds * 1000 <=
        Date.now()
    )
      return;
    const secret = password;
    setPassword("");
    setConfirmation("");
    await execute(preview, secret, confirmation);
  }
  return (
    <form
      onSubmit={event => void submit(event)}
      aria-label={t(
        kind === "RESTORE"
          ? "Confirmar restauração"
          : "Confirmar exclusão operacional"
      )}
    >
      <h3>
        {t(
          kind === "RESTORE"
            ? "Confirmar restauração"
            : "Confirmar exclusão operacional"
        )}
      </h3>
      {kind === "DELETE" && (
        <p>
          {t(
            "Registros necessários a referências preservadas serão mantidos; confira as contagens antes de confirmar."
          )}
        </p>
      )}
      <p>
        {t("Backup de destino:")} {preview.targetBackupId ?? "—"}
      </p>
      <p>
        {t("Válida até:")} {preview.expiresAt}
      </p>
      <ul>
        {Object.entries(preview.currentCounts).map(([model, count]) => (
          <li key={model}>
            {model}: {count} → {preview.targetCounts[model] ?? 0}
          </li>
        ))}
      </ul>
      {Object.entries(preview.targetCounts)
        .filter(([model]) => !(model in preview.currentCounts))
        .map(([model, count]) => (
          <p key={model}>
            {model}: 0 → {count}
          </p>
        ))}
      {!valid && (
        <p role="alert">
          {t(
            "Prévia incompatível ou com modelos ainda não restauráveis. Gere uma nova prévia compatível."
          )}
        </p>
      )}
      {!fresh && (
        <p role="alert">
          {t("Prévia expirada. Gere uma nova prévia antes de confirmar.")}
        </p>
      )}
      <label>
        {t("Senha atual")}
        <input
          type="password"
          autoComplete="off"
          value={password}
          disabled={busy}
          onChange={event => setPassword(event.target.value)}
        />
      </label>
      <label>
        {t("Digite a frase exata:")} {phrase}
        <input
          autoComplete="off"
          value={confirmation}
          disabled={busy}
          onChange={event => setConfirmation(event.target.value)}
        />
      </label>
      <button type="submit" disabled={!ready}>
        {t(
          kind === "RESTORE"
            ? "Executar restauração"
            : "Executar exclusão operacional"
        )}
      </button>
    </form>
  );
}
