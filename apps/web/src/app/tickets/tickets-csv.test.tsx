import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TicketsView } from "./tickets-view";

const first = {
  id: "internal-ticket-id",
  protocol: "2026-000001",
  subject: '=HYPERLINK("private")',
  description: "internal description",
  status: "OPEN",
  priority: "HIGH",
  channel: "PHONE",
  companyId: "hidden-company",
  contactId: null,
  assigneeUserId: "hidden-user",
  queueId: null,
  openedAt: "2026-09-26T12:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  version: 1,
};
const response = (body: unknown, status = 200) =>
  ({ ok: status === 200, status, json: async () => body }) as Response;
const exportButton = () =>
  screen.getByRole("button", { name: "Exportar solicitações CSV" });
let blobs: Blob[];
beforeEach(() => {
  blobs = [];
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:tickets";
      }),
      revokeObjectURL: vi.fn(),
    })
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const text = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
function fetchTickets(handler: (url: URL) => Promise<Response> | Response) {
  const fetchMock = vi.fn((input: string | URL) => {
    const url = new URL(String(input));
    return url.pathname.endsWith("/support-queues")
      ? Promise.resolve(response({ items: [] }))
      : Promise.resolve(handler(url));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
describe("tickets visible CSV", () => {
  it("downloads the real safe CSV for readers without fetching or write permissions", async () => {
    const fetchMock = fetchTickets(() =>
      response({ items: [first], total: 1 })
    );
    render(<TicketsView accessToken="token" canWrite={false} />);
    await screen.findByText(first.subject);
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(exportButton());
    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.type).toBe("text/csv;charset=utf-8");
    const csv = await text(blobs[0]!);
    expect(csv).toContain(
      '"Protocolo","Assunto","Status","Prioridade","Fila","Aberta em"'
    );
    expect(csv).toContain(
      '"2026-000001","\'=HYPERLINK(""private"")","Aberta","Alta","","2026-09-26T12:00:00.000Z"'
    );
    for (const hidden of [
      first.id,
      first.description,
      first.companyId,
      first.assigneeUserId,
      "token",
    ])
      expect(csv).not.toContain(hidden);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    for (const name of [
      "Nova solicitação",
      "Gerenciar filas",
      "Políticas de SLA",
    ])
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });
  it("exports only the loaded page and then only filtered results", async () => {
    const fetchMock = fetchTickets(url =>
      response({
        items: [
          {
            ...first,
            subject: url.searchParams.has("status")
              ? "Filtered ticket"
              : url.searchParams.get("page") === "2"
                ? "Second page ticket"
                : "First page ticket",
          },
        ],
        total: url.searchParams.has("status") ? 1 : 51,
      })
    );
    render(<TicketsView accessToken="token" canWrite />);
    await screen.findByText("First page ticket");
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByText("Second page ticket");
    let calls = fetchMock.mock.calls.length;
    fireEvent.click(exportButton());
    const pageCsv = await text(blobs[0]!);
    expect(pageCsv).toContain("Second page ticket");
    expect(pageCsv).not.toContain("First page ticket");
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    fireEvent.change(screen.getByLabelText("Filtrar por status"), {
      target: { value: "OPEN" },
    });
    await screen.findByText("Filtered ticket");
    calls = fetchMock.mock.calls.length;
    fireEvent.click(exportButton());
    const filteredCsv = await text(blobs[1]!);
    expect(filteredCsv).toContain("Filtered ticket");
    expect(filteredCsv).not.toContain("Second page ticket");
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(
      screen.getByRole("button", { name: "Nova solicitação" })
    ).toBeEnabled();
  });
  it("disables export while loading and after an error retaining stale items", async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => {
      finish = resolve;
    });
    let request = 0;
    fetchTickets(() =>
      ++request === 1 ? pending : response({ message: "denied" }, 403)
    );
    render(<TicketsView accessToken="token" canWrite={false} />);
    expect(exportButton()).toBeDisabled();
    await act(async () => {
      finish(response({ items: [first], total: 51 }));
      await pending;
    });
    await waitFor(() => expect(exportButton()).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(exportButton()).toBeDisabled();
    await screen.findByRole("alert");
    expect(exportButton()).toBeDisabled();
    fireEvent.click(exportButton());
    expect(blobs).toHaveLength(0);
  });
  it("disables export for an empty loaded page", async () => {
    fetchTickets(() => response({ items: [], total: 0 }));
    render(<TicketsView accessToken="token" canWrite={false} />);
    await screen.findByText("Nenhuma solicitação encontrada.");
    expect(exportButton()).toBeDisabled();
    fireEvent.click(exportButton());
    expect(blobs).toHaveLength(0);
  });
});
