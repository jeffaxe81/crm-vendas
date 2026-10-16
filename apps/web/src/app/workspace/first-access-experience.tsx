"use client";

import {
  OnboardingStateSchema,
  availableWorkspaceDestinations,
  type AuthSessionResponse,
  type WorkspaceSection,
} from "@axes/contracts";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";

const explanations: Record<WorkspaceSection, string> = {
  "language-settings":
    "Defina o idioma da empresa e a detecção pelo navegador.",
  home: "Acompanhe seus atalhos, atividades do dia e indicadores mais relevantes.",
  companies: "Cadastre empresas clientes, organize dados e vincule contatos.",
  contacts: "Registre pessoas, telefones, e-mails e vínculos comerciais.",
  opportunities: "Acompanhe negociações no funil, por etapa e responsável.",
  products: "Mantenha seu catálogo de produtos e itens das propostas.",
  agenda: "Organize compromissos e visualize as atividades em calendário.",
  activities: "Registre ligações, tarefas, reuniões e próximos passos.",
  tickets: "Gerencie solicitações de atendimento, filas e responsáveis.",
  communication:
    "Consulte a área de comunicação integrada; conexões externas precisam ser configuradas e autorizadas.",
  "management-summary":
    "Visualize os relatórios e indicadores de desempenho de vendas.",
  territories:
    "Organize regiões comerciais, carteiras e distribuição de metas.",
  "admin-users":
    "Adicione colaboradores e defina permissões de acesso por perfil.",
  "support-settings":
    "Configure filas, políticas e recursos de atendimento disponíveis.",
  "workspace-settings":
    "Escolha sua página inicial, seus favoritos e a organização dos painéis.",
  "integration-credentials":
    "Gerencie credenciais e integrações autorizadas. E-mails externos não são ativados pelo tour.",
  "admin-backups":
    "Superusuários podem criar backups, agendar cópias e conferir prévias sem executar restaurações destrutivas.",
};

type Phase = "loading" | "wizard" | "tour" | "idle" | "error";
type Props = {
  session: AuthSessionResponse;
  onNavigate: (section: WorkspaceSection) => void;
  replayToken: number;
  onOrganizationNameChange: (name: string) => void;
};
const stageNames = [
  "Identificação da empresa",
  "Usuários e permissões",
  "Área comercial e preferências",
  "Integrações e conclusão",
] as const;
const stageDetails = [
  "Confira o nome da empresa que será exibido aos colaboradores.",
  "Entre em Usuários e perfis para cadastrar colegas como administradores, gestores, vendedores ou leitores.",
  "Defina sua página inicial e seus favoritos. Organize contatos, empresas e oportunidades para começar a vender.",
  "Revise integrações quando forem necessárias. O wizard não habilita e-mail, OAuth ou envio de mensagens.",
] as const;
const stageDestinations: WorkspaceSection[] = [
  "home",
  "admin-users",
  "workspace-settings",
  "integration-credentials",
];

export function FirstAccessExperience({
  session,
  onNavigate,
  replayToken,
  onOrganizationNameChange,
}: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [stage, setStage] = useState(1);
  const [organizationName, setOrganizationName] = useState(
    session.organization.name
  );
  const [tourIndex, setTourIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const steps = availableWorkspaceDestinations(
    session.permissions,
    session.membership.isSuperuser === true
  );
  const token = session.accessToken;

  useEffect(() => {
    let alive = true;
    void apiRequest<unknown>("/me/onboarding", { accessToken: token })
      .then(payload => {
        const state = OnboardingStateSchema.parse(payload);
        if (!alive) return;
        setOrganizationName(state.organization.name);
        setStage(state.organization.step);
        if (state.organization.eligible && !state.organization.completed) {
          setPhase("wizard");
        } else if (state.tour.status === "PENDING") {
          setPhase("tour");
          setTourIndex(0);
          onNavigate("home");
        } else {
          setPhase("idle");
        }
      })
      .catch(() => {
        if (alive) setPhase("error");
      });
    return () => {
      alive = false;
    };
    // The caller keys this component by the authenticated org/user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session.organization.id, session.user.id]);

  useEffect(() => {
    if (replayToken < 1) return;
    setError("");
    setTourIndex(0);
    setPhase("tour");
    onNavigate("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayToken]);

  async function advanceWizard() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = stage === 4 ? 4 : stage + 1;
      const updated = await apiRequest<unknown>("/me/onboarding/organization", {
        accessToken: token,
        method: "PUT",
        body: {
          step: next,
          ...(stage === 1 ? { name: organizationName } : {}),
          ...(stage === 4 ? { complete: true } : {}),
        },
      });
      const value = OnboardingStateSchema.shape.organization.parse(updated);
      setOrganizationName(value.name);
      if (stage === 1) onOrganizationNameChange(value.name);
      setStage(value.step);
      if (value.completed) {
        setTourIndex(0);
        setPhase("tour");
        onNavigate("home");
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar etapa."
      );
    } finally {
      setBusy(false);
    }
  }

  async function closeTour(status: "COMPLETED" | "SKIPPED") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/me/onboarding/tour", {
        accessToken: token,
        method: "POST",
        body: { status },
      });
      setPhase("idle");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar tour."
      );
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading" || phase === "idle") return null;
  if (phase === "error") {
    return (
      <aside className="first-access-panel" role="status">
        <h2>{t("Boas-vindas temporariamente indisponíveis")}</h2>
        <p>
          {t(
            "O progresso não foi alterado. Entre novamente para retomar o assistente."
          )}
        </p>
      </aside>
    );
  }

  if (phase === "wizard") {
    const destination = stageDestinations[stage - 1]!;
    const canNavigate = steps.some(step => step.id === destination);
    return (
      <aside
        className="first-access-panel"
        role="dialog"
        aria-label={t("Configuração inicial da empresa")}
        aria-modal="false"
      >
        <p className="first-access-eyebrow">
          {t("AXE CRM 1.1 · Configuração da empresa")}
        </p>
        <h2>{t(stageNames[stage - 1])}</h2>
        <p>
          {t("Etapa ")}
          {stage}
          {t(" de 4 · somente para o primeiro administrador")}
        </p>
        <progress
          value={stage}
          max={4}
          aria-label={t("Progresso da configuração")}
        />
        <p>{t(stageDetails[stage - 1])}</p>
        {stage === 1 ? (
          <label className="first-access-field">
            {t("Nome da organização")}
            <input
              aria-label={t("Nome da organização na configuração inicial")}
              value={organizationName}
              onChange={event => setOrganizationName(event.target.value)}
              maxLength={160}
              minLength={2}
              required
            />
          </label>
        ) : null}
        {stage > 1 && canNavigate ? (
          <button
            type="button"
            className="first-access-link"
            onClick={() => onNavigate(destination)}
          >
            {t("Abrir ")}
            {t(steps.find(item => item.id === destination)?.label ?? "")}
          </button>
        ) : null}
        {error ? <p role="alert">{t(error)}</p> : null}
        <div className="first-access-actions">
          <button
            type="button"
            onClick={() => void advanceWizard()}
            disabled={
              busy || (stage === 1 && organizationName.trim().length < 2)
            }
          >
            {busy
              ? t("Salvando...")
              : stage === 4
                ? t("Concluir configuração e iniciar tour")
                : t("Salvar e continuar")}
          </button>
        </div>
        <small>
          {t(
            "O progresso é salvo por empresa. Você pode continuar no próximo acesso."
          )}
        </small>
      </aside>
    );
  }

  const step = steps[tourIndex];
  if (!step) return null;
  return (
    <aside
      className="first-access-panel"
      role="dialog"
      aria-label={t("Tour das funcionalidades do CRM")}
      aria-modal="false"
    >
      <p className="first-access-eyebrow">
        {t("AXE CRM 1.1 · Conheça o sistema")}
      </p>
      <h2>{t(step.label)}</h2>
      <p>
        {t("Passo ")}
        {tourIndex + 1}
        {t(" de ")}
        {steps.length}
      </p>
      <progress
        value={tourIndex + 1}
        max={steps.length}
        aria-label={t("Progresso do tour")}
      />
      <p>{t(explanations[step.id])}</p>
      <p>{t("Esta seção está aberta no CRM para você explorar.")}</p>
      {error ? <p role="alert">{t(error)}</p> : null}
      <div className="first-access-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void closeTour("SKIPPED")}
        >
          {t("Pular tour")}
        </button>
        {tourIndex > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const previous = tourIndex - 1;
              setTourIndex(previous);
              onNavigate(steps[previous]!.id);
            }}
          >
            {t("Voltar")}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (tourIndex + 1 === steps.length) {
              void closeTour("COMPLETED");
            } else {
              const next = tourIndex + 1;
              setTourIndex(next);
              onNavigate(steps[next]!.id);
            }
          }}
        >
          {tourIndex + 1 === steps.length ? t("Concluir tour") : t("Próximo")}
        </button>
      </div>
      <small>
        {t(
          "O tour é individual e respeita as permissões do seu perfil. Pode ser reaberto em Ajuda."
        )}
      </small>
    </aside>
  );
}
