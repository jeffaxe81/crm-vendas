/**
 * Explicit browser-only exports of records already loaded by an authorized
 * CRM view. No additional API calls or server-side export jobs are issued.
 */

type CsvValue = string | number | boolean | null | undefined;

function downloadLocalFile(
  filename: string,
  content: string,
  mediaType: string
): void {
  const blob = new Blob([content], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(raw: CsvValue): string {
  const value = raw == null ? "" : String(raw);
  // CSV injection protection for Excel/LibreOffice. Quote every field as well.
  const safeValue = /^[\s]*[=+\-@]/u.test(value) ? "'" + value : value;
  return '"' + safeValue.replace(/"/g, '""') + '"';
}

export function downloadLoadedCsv(
  filename: string,
  columns: readonly string[],
  rows: readonly (readonly CsvValue[])[]
): void {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((_, index) => csvCell(row[index])).join(","));
  }
  downloadLocalFile(
    filename,
    "\uFEFF" + lines.join("\r\n") + "\r\n",
    "text/csv;charset=utf-8"
  );
}

export type VcardContact = {
  fullName: string;
  jobTitle?: string | null;
  channels?: readonly { type: string; value: string }[];
};

function escapeCardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function downloadLoadedVcards(
  filename: string,
  contacts: readonly VcardContact[]
): void {
  const lines: string[] = [];
  for (const contact of contacts) {
    if (!contact.fullName.trim()) continue;
    lines.push("BEGIN:VCARD", "VERSION:3.0", "N:;;;;");
    lines.push("FN:" + escapeCardValue(contact.fullName));
    if (contact.jobTitle) {
      lines.push("TITLE:" + escapeCardValue(contact.jobTitle));
    }
    for (const channel of contact.channels ?? []) {
      if (!channel.value.trim()) continue;
      const value = escapeCardValue(channel.value);
      if (channel.type === "EMAIL") {
        lines.push("EMAIL;TYPE=INTERNET:" + value);
      } else if (channel.type === "MOBILE" || channel.type === "WHATSAPP") {
        lines.push("TEL;TYPE=CELL:" + value);
      } else if (channel.type === "PHONE") {
        lines.push("TEL;TYPE=VOICE:" + value);
      }
    }
    lines.push("END:VCARD");
  }
  downloadLocalFile(
    filename,
    lines.join("\r\n") + "\r\n",
    "text/vcard;charset=utf-8"
  );
}

export type CalendarExportItem = {
  id: string;
  title: string;
  dueAt: string | null;
  type?: "TASK" | "APPOINTMENT";
};

function escapeCalendarValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function toUtcCalendarTime(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function downloadLoadedCalendar(
  filename: string,
  items: readonly CalendarExportItem[]
): void {
  const generatedAt = toUtcCalendarTime(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AXE CRM//Local export//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const item of items) {
    if (!item.dueAt || !item.title.trim()) continue;
    const startsAt = new Date(item.dueAt);
    if (Number.isNaN(startsAt.getTime())) continue;
    // CRM stores only the due date, not a duration; use a provisional slot.
    const minutes = item.type === "APPOINTMENT" ? 60 : 30;
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const safeId = item.id.replace(/[^a-zA-Z0-9-]/g, "");
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + (safeId || "crm-item") + "@crm-vendas.local",
      "DTSTAMP:" + generatedAt,
      "DTSTART:" + toUtcCalendarTime(startsAt),
      "DTEND:" + toUtcCalendarTime(endsAt),
      "SUMMARY:" + escapeCalendarValue(item.title),
      "STATUS:TENTATIVE",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  downloadLocalFile(
    filename,
    lines.join("\r\n") + "\r\n",
    "text/calendar;charset=utf-8"
  );
}
