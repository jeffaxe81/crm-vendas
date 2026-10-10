import type { TransactionalEmail } from "./email-provider";

type SharedFields = {
  organizationId: string;
  ticketId: string;
  recipient: string;
  protocol: string;
};

export type SlaDueEmailInput = SharedFields & {
  dueAt: Date;
  minutesRemaining: number;
};

export type SatisfactionEmailInput = SharedFields & {
  surveyId: string;
  surveyVersion: number;
  surveyUrl: string;
};

function singleLine(value: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > maxLength ||
    value.trim() !== value ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error("INVALID_EMAIL_FIELD");
  return value;
}

function recipientAddress(value: string): string {
  const address = singleLine(value, 254);
  // Deliberately narrow mailbox syntax: fail closed rather than risk SMTP
  // header injection or provider-specific interpretation of display names.
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(address))
    throw new Error("INVALID_EMAIL_RECIPIENT");
  return address;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function shared(input: SharedFields) {
  return {
    organizationId: singleLine(input.organizationId, 64),
    referenceId: singleLine(input.ticketId, 64),
    recipient: recipientAddress(input.recipient),
    protocol: singleLine(input.protocol, 80),
  };
}

/** Rendering is deterministic and never inserts user-provided raw HTML. */
export function composeSlaDueEmail(
  input: SlaDueEmailInput
): TransactionalEmail {
  const fields = shared(input);
  if (
    !Number.isInteger(input.minutesRemaining) ||
    input.minutesRemaining < 0 ||
    input.minutesRemaining > 10080 ||
    !(input.dueAt instanceof Date) ||
    !Number.isFinite(input.dueAt.getTime())
  )
    throw new Error("INVALID_SLA_EMAIL_INPUT");
  const minutes = input.minutesRemaining;
  const message =
    `A solicitação ${fields.protocol} está próxima do vencimento do SLA. Restam ${minutes} minutos.`;
  return {
    organizationId: fields.organizationId,
    referenceId: fields.referenceId,
    idempotencyKey:
      `sla:${fields.organizationId}:${fields.referenceId}:${input.dueAt.toISOString()}`,
    recipient: fields.recipient,
    purpose: "SLA_DUE_SOON",
    subject: `Alerta de SLA — ${fields.protocol}`,
    text: message,
    html:
      `<p>A solicitação <strong>${escapeHtml(fields.protocol)}</strong> está próxima do vencimento do SLA.</p><p>Restam ${minutes} minutos.</p>`,
  };
}

/** Links are supplied by the existing satisfaction service, never synthesized from a client payload. */
export function composeSatisfactionEmail(
  input: SatisfactionEmailInput
): TransactionalEmail {
  const fields = shared(input);
  const surveyId = singleLine(input.surveyId, 64);
  if (
    !Number.isSafeInteger(input.surveyVersion) ||
    input.surveyVersion < 1
  )
    throw new Error("INVALID_SURVEY_VERSION");
  const url = new URL(input.surveyUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    !url.pathname.startsWith("/avaliacao/") ||
    url.toString() !== input.surveyUrl
  )
    throw new Error("INVALID_SURVEY_URL");
  return {
    organizationId: fields.organizationId,
    referenceId: fields.referenceId,
    idempotencyKey:
      `satisfaction:${fields.organizationId}:${surveyId}:${input.surveyVersion}`,
    recipient: fields.recipient,
    purpose: "SATISFACTION_REQUEST",
    subject: `Pesquisa de satisfação — ${fields.protocol}`,
    text:
      `Avalie o atendimento da solicitação ${fields.protocol}: ${url.toString()}`,
    html:
      `<p>Avalie o atendimento da solicitação <strong>${escapeHtml(fields.protocol)}</strong>.</p><p><a href="${escapeHtml(url.toString())}">Responder à pesquisa</a></p>`,
  };
}
