"use client";

import {
  SaveButton,
  SaveNotice,
  useSaveFeedback,
} from "../../components/save-feedback";

import {
  OnboardingStateSchema,
  QuickSetupStateSchema,
  availableWorkspaceDestinations,
  type AuthSessionResponse,
  type QuickSetupState,
  type WorkspaceSection,
} from "@axes/contracts";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";

type Props = {
  session: AuthSessionResponse;
  onNavigate: (section: WorkspaceSection) => void;
  openToken: number;
};

type Phase = "loading" | "open" | "idle" | "error";

const guidance: Record<AuthSessionResponse["membership"]["role"], string> = {
  ADMIN:
    "Revise organização, equipe, estrutura comercial e cadastros antes de concluir.",
  MANAGER:
    "Revise a estrutura comercial e os recursos de gestão liberados para sua sessão.",
  SELLER:
    "Prepare os cadastros comerciais disponíveis e revise a ajuda antes de operar.",
  VIEWER:
    "Use esta configuração apenas como orientação. Seu perfil permanece somente leitura.",
};

export function QuickSetupExperience({
  session,
  onNavigate,
  openToken,
}: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<QuickSetupState | null>(null);
  const saveFeedback = useSaveFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const token = session.accessToken;

  const allowedDestinations = useMemo(
    () =>
      new Set(
        availableWorkspaceDestinations(session.permissions).map(item => item.id)
      ),
    [session.permissions]
  );

  async function load(forceOpen: boolean) {
    setPhase("loading");
    setError("");

    try {
      const onboarding = OnboardingStateSchema.parse(
        await apiRequest<unknown>("/me/onboarding", { accessToken: token })
      );

      const firstAccessFinished =
        onboarding.organization.completed &&
        onboarding.tour.status !== "PENDING";

      if (!firstAccessFinished) {
        setPhase("idle");
        return;
      }

      const quickSetup = QuickSetupStateSchema.parse(
        await apiRequest<unknown>("/me/quick-setup", { accessToken: token })
      );
      setState(quickSetup);
      setPhase(forceOpen || !quickSetup.completed ? "open" : "idle");
    } catch (cause) {
      // Do not interrupt unrelated CRM pages on an automatic background load.
      // Explicitly opening the setup must still expose failures and retry.
      if (!forceOpen) {
        setPhase("idle");
        return;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar a configuração rápida."
      );
      setPhase("error");
    }
  }

  useEffect(() => {
    void load(openToken > 0);
    // The authenticated session scopes all server-side quick setup state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    token,
    session.organization.id,
    session.user.id,
    session.membership.id,
    openToken,
  ]);

  const currentStep =
    state?.steps.find(step => !state.completedSteps.includes(step.id)) ?? null;

  async function completeCurrentStep() {
    if (!currentStep || busy) return;
    setBusy(true);
    setError("");

    if (!saveFeedback.start()) return;
    try {
      const updated = QuickSetupStateSchema.parse(
        await apiRequest<unknown>("/me/quick-setup/progress", {
          accessToken: token,
          method: "POST",
          body: {
            stepId: currentStep.id,
            ...(currentStep.id === "review" ? { complete: true } : {}),
          },
        })
      );
      saveFeedback.saved();
      setState(updated);
    } catch (cause) {
      saveFeedback.failed();
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o progresso."
      );
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const updated = QuickSetupStateSchema.parse(
        await apiRequest<unknown>("/me/quick-setup/reopen", {
          accessToken: token,
          method: "POST",
        })
      );
      setState(updated);
      setPhase("open");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível reabrir a configuração."
      );
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading" || phase === "idle") return null;

  if (phase === "error") {
    return (
      <aside
        className="first-access-panel"
        role="dialog"
        aria-label={t("Configuração rápida do CRM")}
        aria-modal="false"
      >
        <p className="first-access-eyebrow">
          {t("AXE CRM 1.2 · Configuração rápida")}
        </p>
        <h2>{t("Configuração temporariamente indisponível")}</h2>
        <p role="alert">{t(error)}</p>
        <div className="first-access-actions">
          <button type="button" onClick={() => void load(true)}>
            {t("Tentar novamente")}
          </button>
        </div>
      </aside>
    );
  }

  if (!state) return null;

  if (state.completed) {
    return (
      <aside
        className="first-access-panel"
        role="dialog"
        aria-label={t("Configuração rápida do CRM")}
        aria-modal="false"
      >
        <p className="first-access-eyebrow">
          {t("AXE CRM 1.2 · Configuração rápida")}
        </p>
        <h2>{t("Configuração concluída")}</h2>
        <SaveNotice
          status={saveFeedback.status}
          label={t("Configuração concluída e salva.")}
        />
        <p>
          {t("Perfil ")}
          {session.membership.role}
          {t(". O progresso desta organização e usuário está concluído.")}
        </p>
        {error ? <p role="alert">{t(error)}</p> : null}
        <div className="first-access-actions">
          <button type="button" onClick={() => setPhase("idle")}>
            {t("Fechar")}
          </button>
          <button type="button" disabled={busy} onClick={() => void reopen()}>
            {t("Refazer configuração")}
          </button>
        </div>
      </aside>
    );
  }

  if (!currentStep) return null;

  const destination =
    currentStep.destination &&
    allowedDestinations.has(currentStep.destination as WorkspaceSection)
      ? (currentStep.destination as WorkspaceSection)
      : null;
  const stepIndex = state.steps.findIndex(step => step.id === currentStep.id);

  return (
    <aside
      className="first-access-panel"
      role="dialog"
      aria-label={t("Configuração rápida do CRM")}
      aria-modal="false"
    >
      <p className="first-access-eyebrow">
        {t("AXE CRM 1.2 · Configuração rápida")}
      </p>
      <h2>{t(currentStep.title)}</h2>
      <p>
        {t("Passo ")}
        {stepIndex + 1}
        {t(" de ")}
        {state.steps.length}
        {t(" · Perfil")} {session.membership.role}
      </p>
      <progress
        value={state.completedSteps.length}
        max={state.steps.length}
        aria-label={t("Progresso da configuração rápida")}
      />
      <p>{t(currentStep.description)}</p>
      <p>{guidance[session.membership.role]}</p>

      {destination ? (
        <button
          type="button"
          className="first-access-link"
          onClick={() => onNavigate(destination)}
        >
          {t("Abrir ")}
          {t(currentStep.title)}
        </button>
      ) : null}

      <SaveNotice status={saveFeedback.status} label={t("Etapa salva.")} />
      {error ? <p role="alert">{t(error)}</p> : null}

      <div className="first-access-actions">
        <button type="button" onClick={() => setPhase("idle")}>
          {t("Fechar")}
        </button>
        <SaveButton
          type="button"
          disabled={busy}
          onClick={() => void completeCurrentStep()}
          status={saveFeedback.status}
          label={t("Concluir etapa {0}", { 0: t(currentStep.title) })}
        />
      </div>
      <small>
        {t(
          "O progresso é salvo separadamente das alterações de negócio e pode ser retomado em outro acesso."
        )}
      </small>
    </aside>
  );
}
