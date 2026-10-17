"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useTranslation } from "../i18n/language-provider";

export type SaveStatus = "idle" | "saving" | "success" | "error";

export function useSaveFeedback() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimer();
    };
  }, []);

  return {
    status,
    reset() {
      if (pending.current) return;
      clearTimer();
      setStatus("idle");
    },
    start() {
      if (pending.current) return false;
      clearTimer();
      pending.current = true;
      setStatus("saving");
      return true;
    },
    saved() {
      pending.current = false;
      if (!alive.current) return;
      setStatus("success");
      clearTimer();
      timer.current = setTimeout(() => {
        if (alive.current) setStatus("idle");
      }, 3000);
    },
    failed() {
      pending.current = false;
      clearTimer();
      if (alive.current) setStatus("error");
    },
  };
}

export function SaveButton({
  status,
  label,
  disabled,
  className = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  status: SaveStatus;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      {...props}
      className={`${className} save-feedback-button`}
      data-save-status={status}
      disabled={disabled || status === "saving"}
      aria-busy={status === "saving"}
      aria-label={label}
    >
      {status === "saving" ? (
        <>
          <span className="save-feedback-spinner" aria-hidden="true" />{" "}
          {t("Salvando…")}
        </>
      ) : status === "success" ? (
        `✓ ${t("Salvo!")}`
      ) : (
        label
      )}
    </button>
  );
}

// Keep confirmation outside forms that close after a successful write.
export function SaveNotice({
  status,
  label = "Alterações salvas.",
}: {
  status: SaveStatus;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <p
      className="save-feedback-notice"
      data-save-status={status}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {status === "saving"
        ? t("Salvando…")
        : status === "success"
          ? `✓ ${t(label)}`
          : status === "error"
            ? t(
                "Não foi possível salvar. Confira a mensagem de erro e tente novamente."
              )
            : ""}
    </p>
  );
}
