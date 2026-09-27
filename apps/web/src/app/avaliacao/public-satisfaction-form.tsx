"use client";

import {
  PublicTicketSatisfactionSchema,
  TICKET_SATISFACTION_COMMENT_MAX,
  type PublicTicketSatisfaction,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { ApiError, apiRequest } from "../../lib/api-client";

type PublicSatisfactionFormProps = {
  token: string;
};

export const ratingOptions: Array<{ value: number; label: string }> = [
  { value: 1, label: "Muito insatisfeito" },
  { value: 2, label: "Insatisfeito" },
  { value: 3, label: "Neutro" },
  { value: 4, label: "Satisfeito" },
  { value: 5, label: "Muito satisfeito" },
];

/** Mensagem ao cliente por status HTTP, sem revelar detalhes internos. */
export function publicSatisfactionError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 404) {
      return "Link de avaliação inválido. Confira o endereço recebido.";
    }
    if (cause.status === 409) {
      return "Esta avaliação já foi respondida. Obrigado!";
    }
    if (cause.status === 410) {
      return "Este link de avaliação expirou.";
    }
    if (cause.status === 400) {
      return cause.message;
    }
  }
  return "Não foi possível concluir agora. Tente novamente em instantes.";
}

type Phase = "loading" | "ready" | "done" | "unavailable";

/** C5.4 — formulário público de avaliação (sem login). */
export function PublicSatisfactionForm({ token }: PublicSatisfactionFormProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<PublicTicketSatisfaction | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `/public/satisfaction/${encodeURIComponent(token)}`;

  useEffect(() => {
    let active = true;
    apiRequest<unknown>(path)
      .then(payload => {
        if (!active) return;
        setInfo(PublicTicketSatisfactionSchema.parse(payload));
        setPhase("ready");
      })
      .catch(cause => {
        if (!active) return;
        setMessage(publicSatisfactionError(cause));
        setPhase("unavailable");
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating === null) {
      setMessage("Escolha uma nota de 1 a 5.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiRequest<unknown>(path, {
        method: "POST",
        body: {
          rating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      });
      setPhase("done");
    } catch (cause) {
      setMessage(publicSatisfactionError(cause));
      if (cause instanceof ApiError && [404, 409, 410].includes(cause.status)) {
        setPhase("unavailable");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="satisfaction-title">
        <p className="login-card__eyebrow">
          {info ? info.organizationName : "Pesquisa de satisfação"}
        </p>
        <h1 id="satisfaction-title">Avalie o atendimento</h1>

        {phase === "loading" ? (
          <p className="login-card__help">Carregando...</p>
        ) : phase === "unavailable" ? (
          <p className="login-form__error" role="alert">
            {message}
          </p>
        ) : phase === "done" ? (
          <p className="login-card__help" role="status">
            Obrigado! Sua avaliação foi registrada.
          </p>
        ) : info ? (
          <form
            className="login-form"
            aria-label="Avaliação do atendimento"
            onSubmit={submit}
          >
            <p className="login-card__help">
              Protocolo <strong>{info.protocol}</strong> — {info.subject}
            </p>
            <fieldset>
              <legend>Como você avalia o atendimento?</legend>
              {ratingOptions.map(option => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="rating"
                    value={option.value}
                    checked={rating === option.value}
                    disabled={busy}
                    onChange={() => setRating(option.value)}
                  />
                  <span>
                    {option.value} — {option.label}
                  </span>
                </label>
              ))}
            </fieldset>
            <label>
              <span>Comentário (opcional)</span>
              <textarea
                value={comment}
                maxLength={TICKET_SATISFACTION_COMMENT_MAX}
                disabled={busy}
                onChange={event => setComment(event.target.value)}
              />
            </label>
            {message ? (
              <p className="login-form__error" role="alert">
                {message}
              </p>
            ) : null}
            <button type="submit" className="button" disabled={busy}>
              Enviar avaliação
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
