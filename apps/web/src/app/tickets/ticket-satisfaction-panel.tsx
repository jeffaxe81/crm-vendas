"use client";

import {
  TicketSatisfactionLinkResultSchema,
  TicketSatisfactionStatusSchema,
  type TicketSatisfactionLink,
  type TicketSatisfactionState,
  type TicketSatisfactionSurvey,
  type TicketStatus,
} from "@axes/contracts";
import { useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { dateTime } from "./ticket-labels";
import { useTranslation } from "../../i18n/language-provider";

type TicketSatisfactionPanelProps = {
  accessToken: string;
  ticketId: string;
  ticketStatus: TicketStatus;
  canWrite: boolean;
  /** Link devolvido pela resolução (exibido uma única vez). */
  freshLink: TicketSatisfactionLink | null;
};

export const satisfactionStateLabels: Record<TicketSatisfactionState, string> =
  {
    PENDING: "Aguardando resposta",
    RESPONDED: "Respondida",
    EXPIRED: "Link expirado",
  };

const LINK_STATUSES: readonly TicketStatus[] = ["RESOLVED", "CLOSED"];

/** C5.4 — bloco "Satisfação" no detalhe da solicitação. */
export function TicketSatisfactionPanel({
  accessToken,
  ticketId,
  ticketStatus,
  canWrite,
  freshLink,
}: TicketSatisfactionPanelProps) {
  const { t } = useTranslation();
  const [survey, setSurvey] = useState<TicketSatisfactionSurvey | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [link, setLink] = useState<TicketSatisfactionLink | null>(freshLink);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    setLink(freshLink);
    setCopied(false);
  }, [freshLink]);

  useEffect(() => {
    let active = true;
    setError("");
    setLoaded(false);
    setReadFailed(false);
    apiRequest<unknown>(`/tickets/${ticketId}/satisfaction`, { accessToken })
      .then(payload => {
        if (!active) return;
        const currentSurvey =
          TicketSatisfactionStatusSchema.parse(payload).survey;
        setSurvey(currentSurvey);
        if (
          currentSurvey?.state === "RESPONDED" ||
          currentSurvey?.state === "EXPIRED"
        ) {
          setLink(null);
        }
        setLoaded(true);
      })
      .catch(cause => {
        if (!active) return;
        setReadFailed(true);
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar a pesquisa de satisfação."
        );
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [accessToken, ticketId, ticketStatus, refreshVersion]);

  async function generateLink() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const payload = await apiRequest<unknown>(
        `/tickets/${ticketId}/satisfaction/link`,
        {
          accessToken,
          method: "POST",
          body: survey ? { version: survey.version } : {},
        }
      );
      const result = TicketSatisfactionLinkResultSchema.parse(payload);
      setSurvey(result.survey);
      setLink(result.link);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível gerar o link."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setError(
        t("Não foi possível copiar; selecione o link e copie manualmente.")
      );
    }
  }

  const canGenerate =
    canWrite &&
    loaded &&
    !readFailed &&
    survey !== null &&
    survey.state !== "RESPONDED" &&
    LINK_STATUSES.includes(ticketStatus);

  return (
    <section
      className="ticket-satisfaction"
      aria-labelledby={`ticket-satisfaction-${ticketId}`}
    >
      <h3 id={`ticket-satisfaction-${ticketId}`}>{t("Satisfação")}</h3>

      {error ? (
        <p className="companies-view__error" role="alert">
          {t(error)}
        </p>
      ) : null}

      {!loaded || readFailed ? null : survey === null ? (
        <p className="activities-view__status">
          {t("A pesquisa é criada quando a solicitação é resolvida.")}
        </p>
      ) : (
        <dl className="ticket-detail__facts">
          <div>
            <dt>{t("Situação")}</dt>
            <dd>{t(satisfactionStateLabels[survey.state])}</dd>
          </div>
          <div>
            <dt>{t("Nota")}</dt>
            <dd>{survey.rating === null ? "—" : `${survey.rating}/5`}</dd>
          </div>
          {survey.respondedAt ? (
            <div>
              <dt>{t("Respondida em")}</dt>
              <dd>{dateTime.format(new Date(survey.respondedAt))}</dd>
            </div>
          ) : (
            <div>
              <dt>{t("Link válido até")}</dt>
              <dd>{dateTime.format(new Date(survey.expiresAt))}</dd>
            </div>
          )}
          {survey.comment ? (
            <div>
              <dt>{t("Comentário")}</dt>
              <dd>{survey.comment}</dd>
            </div>
          ) : null}
        </dl>
      )}

      {link ? (
        <div className="ticket-satisfaction__link">
          <label>
            <span>{t("Link para o cliente")}</span>
            <input
              readOnly
              value={link.url}
              onFocus={event => event.target.select()}
            />
          </label>
          <button type="button" onClick={() => void copyLink()}>
            {copied ? t("Copiado") : t("Copiar link")}
          </button>
          <p className="activities-view__status">
            {t(
              "Este link é exibido somente agora. Envie ao cliente; gerar um novo invalida o anterior."
            )}
          </p>
        </div>
      ) : null}

      {LINK_STATUSES.includes(ticketStatus) ? (
        <button
          type="button"
          disabled={!loaded || busy}
          onClick={() => {
            setLink(null);
            setCopied(false);
            setRefreshVersion(value => value + 1);
          }}
        >
          {t("Atualizar pesquisa")}
        </button>
      ) : null}

      {canGenerate ? (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void generateLink()}
        >
          {t("Gerar link")}
        </button>
      ) : null}
    </section>
  );
}
