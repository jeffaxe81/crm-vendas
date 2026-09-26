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
  const [survey, setSurvey] = useState<TicketSatisfactionSurvey | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [link, setLink] = useState<TicketSatisfactionLink | null>(freshLink);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLink(freshLink);
    setCopied(false);
  }, [freshLink]);

  useEffect(() => {
    let active = true;
    apiRequest<unknown>(`/tickets/${ticketId}/satisfaction`, { accessToken })
      .then(payload => {
        if (!active) return;
        setSurvey(TicketSatisfactionStatusSchema.parse(payload).survey);
        setLoaded(true);
      })
      .catch(cause => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar a pesquisa de satisfação."
        );
      });
    return () => {
      active = false;
    };
  }, [accessToken, ticketId, ticketStatus]);

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
        "Não foi possível copiar; selecione o link e copie manualmente."
      );
    }
  }

  const canGenerate =
    canWrite &&
    survey !== null &&
    survey.state !== "RESPONDED" &&
    LINK_STATUSES.includes(ticketStatus);

  return (
    <section
      className="ticket-satisfaction"
      aria-labelledby={`ticket-satisfaction-${ticketId}`}
    >
      <h3 id={`ticket-satisfaction-${ticketId}`}>Satisfação</h3>

      {error ? (
        <p className="companies-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {!loaded ? null : survey === null ? (
        <p className="activities-view__status">
          A pesquisa é criada quando a solicitação é resolvida.
        </p>
      ) : (
        <dl className="ticket-detail__facts">
          <div>
            <dt>Situação</dt>
            <dd>{satisfactionStateLabels[survey.state]}</dd>
          </div>
          <div>
            <dt>Nota</dt>
            <dd>{survey.rating === null ? "—" : `${survey.rating}/5`}</dd>
          </div>
          {survey.respondedAt ? (
            <div>
              <dt>Respondida em</dt>
              <dd>{dateTime.format(new Date(survey.respondedAt))}</dd>
            </div>
          ) : (
            <div>
              <dt>Link válido até</dt>
              <dd>{dateTime.format(new Date(survey.expiresAt))}</dd>
            </div>
          )}
          {survey.comment ? (
            <div>
              <dt>Comentário</dt>
              <dd>{survey.comment}</dd>
            </div>
          ) : null}
        </dl>
      )}

      {link ? (
        <div className="ticket-satisfaction__link">
          <label>
            <span>Link para o cliente</span>
            <input
              readOnly
              value={link.url}
              onFocus={event => event.target.select()}
            />
          </label>
          <button type="button" onClick={() => void copyLink()}>
            {copied ? "Copiado" : "Copiar link"}
          </button>
          <p className="activities-view__status">
            Este link é exibido somente agora. Envie ao cliente; gerar um novo
            invalida o anterior.
          </p>
        </div>
      ) : null}

      {canGenerate ? (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void generateLink()}
        >
          Gerar link
        </button>
      ) : null}
    </section>
  );
}
