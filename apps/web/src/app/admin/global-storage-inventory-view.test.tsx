import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GlobalStorageInventoryView } from "./global-storage-inventory-view";

const organizationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const backupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const report = {
  configured: true,
  readOnly: true,
  complete: true,
  atomicSnapshot: false,
  scope: "ALL_ORGANIZATIONS",
  catalogCount: 1,
  physicalObjectCount: 1,
  physicalBytes: "900719925474099312345",
  orphanCount: 0,
  missingCount: 0,
  sizeMismatchCount: 0,
  unreadableCount: 1,
  stateInconsistencyCount: 1,
  temporaryCount: 0,
  unexpectedCount: 0,
  tenants: [
    {
      organizationId,
      catalogCount: 1,
      completedCount: 0,
      physicalObjectCount: 1,
      catalogBytes: "0",
      physicalBytes: "0",
    },
  ],
  findings: [
    {
      backupId,
      organizationId,
      status: "UNREADABLE",
      catalogBytes: null,
      filesystemBytes: null,
    },
    {
      backupId,
      organizationId,
      status: "STATE_INCONSISTENCY",
      catalogBytes: null,
      filesystemBytes: null,
    },
  ],
};
const response = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => data }) as Response;
const consult = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Consultar inventário global" })
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("consults only after click, without query overrides, and preserves exact bytes", async () => {
  const fetcher = vi.fn(async () => response(report));
  vi.stubGlobal("fetch", fetcher);
  render(<GlobalStorageInventoryView accessToken="human-superuser" />);
  expect(fetcher).not.toHaveBeenCalled();
  consult();
  expect(await screen.findByText("Varredura concluída.")).toBeInTheDocument();
  const [url, options] = fetcher.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toMatch(/\/admin\/storage\/inventory$/);
  expect(options.cache).toBe("no-store");
  expect((options.headers as Record<string, string>).Authorization).toBe(
    "Bearer human-superuser"
  );
  expect(
    screen.getByText(BigInt(report.physicalBytes).toLocaleString("pt-BR"))
  ).toBeInTheDocument();
  const findings = screen.getByRole("table", {
    name: "Ocorrências do inventário",
  });
  expect(within(findings).getByText("Arquivo inacessível")).toBeInTheDocument();
  expect(
    within(findings).getByText("Registro excluído com objeto físico")
  ).toBeInTheDocument();
});

it("prevents duplicate scans while pending and retries after an HTTP error", async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    )
    .mockResolvedValue(response({ ...report, findings: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<GlobalStorageInventoryView accessToken="human-superuser" />);
  consult();
  expect(
    screen.getByRole("button", { name: "Consultando inventário..." })
  ).toBeDisabled();
  await act(async () => finish(response({ message: "not permitted" }, 403)));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível consultar o inventário."
  );
  expect(screen.queryByText("Varredura concluída.")).not.toBeInTheDocument();
  consult();
  expect(await screen.findByText("Varredura concluída.")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([false, true])(
  "does not claim success for unavailable or partial storage (configured=%s)",
  async configured => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({ ...report, configured, complete: false, findings: [] })
      )
    );
    render(<GlobalStorageInventoryView accessToken="human-superuser" />);
    consult();
    expect(
      await screen.findByText(
        configured
          ? "Resultado parcial."
          : "O armazenamento de backups não está configurado neste servidor."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Varredura concluída.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Nenhuma inconsistência encontrada nesta consulta.")
    ).not.toBeInTheDocument();
  }
);

it("rejects malformed reports without displaying counts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response({ ...report, physicalBytes: -1 }))
  );
  render(<GlobalStorageInventoryView accessToken="human-superuser" />);
  consult();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "O inventário retornou dados inválidos."
  );
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("clears the old session immediately and ignores its delayed response", async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(report))
    .mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    );
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(
    <GlobalStorageInventoryView accessToken="old-session" />
  );
  consult();
  expect(await screen.findByText("Varredura concluída.")).toBeInTheDocument();
  consult();
  rerender(<GlobalStorageInventoryView accessToken="new-session" />);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  await act(async () => finish(response(report)));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("paginates and filters locally without another scan", async () => {
  const findings = Array.from({ length: 22 }, (_, i) => ({
    ...report.findings[0],
    backupId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
    status: i === 21 ? "MISSING" : "UNREADABLE",
  }));
  const fetcher = vi.fn(async () => response({ ...report, findings }));
  vi.stubGlobal("fetch", fetcher);
  render(<GlobalStorageInventoryView accessToken="human-superuser" />);
  consult();
  const table = await screen.findByRole("table", {
    name: "Ocorrências do inventário",
  });
  expect(within(table).getAllByRole("row")).toHaveLength(21);
  fireEvent.click(
    screen.getByRole("button", { name: "Próxima página de ocorrências" })
  );
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  fireEvent.change(screen.getByLabelText("Filtrar ocorrências"), {
    target: { value: "MISSING" },
  });
  await waitFor(() =>
    expect(within(table).getAllByRole("row")).toHaveLength(2)
  );
  expect(within(table).getByText("Arquivo ausente")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("removes a completed report synchronously when the session changes", async () => {
  const fetcher = vi.fn(async () => response(report));
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(
    <GlobalStorageInventoryView accessToken="old-session" />
  );
  consult();
  expect(await screen.findByText("Varredura concluída.")).toBeInTheDocument();
  rerender(<GlobalStorageInventoryView accessToken="new-session" />);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("discards a completed report when refreshing fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(report))
    .mockResolvedValueOnce(response({}, 500));
  vi.stubGlobal("fetch", fetcher);
  render(<GlobalStorageInventoryView accessToken="human-superuser" />);
  consult();
  expect(await screen.findByText("Varredura concluída.")).toBeInTheDocument();
  consult();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível consultar o inventário."
  );
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("paginates companies without requesting another global inventory", async () => {
  const tenants = Array.from({ length: 22 }, (_, i) => ({
    ...report.tenants[0],
    organizationId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`,
  }));
  const fetcher = vi.fn(async () =>
    response({
      ...report,
      catalogCount: 22,
      physicalObjectCount: 22,
      tenants,
      findings: [],
    })
  );
  vi.stubGlobal("fetch", fetcher);
  render(<GlobalStorageInventoryView accessToken="human-superuser" />);
  consult();
  const table = await screen.findByRole("table", {
    name: "Consumo conhecido por empresa",
  });
  expect(within(table).getAllByRole("row")).toHaveLength(21);
  fireEvent.click(
    screen.getByRole("button", { name: "Próxima página de empresas" })
  );
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(
    within(table).getByText(tenants[21]!.organizationId)
  ).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
