import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TenantStorageReconciliationView } from "./tenant-storage-reconciliation-view";

const report = {
  configured: true,
  scope: "COMPLETED_TENANT_BACKUPS",
  metadataOnly: true,
  scanLimit: 50,
  catalogCount: 2,
  checkedCount: 2,
  complete: true,
  nextCursor: null,
  matchingCount: 1,
  missingCount: 1,
  sizeMismatchCount: 0,
  unreadableCount: 0,
  scannedFilesystemBytes: "120",
  findings: [
    {
      backupId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "MISSING",
      catalogBytes: "100",
      filesystemBytes: null,
    },
  ],
};

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("runs only on a manual click and shows tenant-scoped findings", async () => {
  const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    expect((options?.headers as Record<string, string>).Authorization).toBe(
      "Bearer tenant-a"
    );
    return response(report);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<TenantStorageReconciliationView accessToken="tenant-a" />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Conferir arquivos desta empresa" })
  );
  expect(await screen.findByText(/Arquivo ausente/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toContain(
    "/admin/storage/reconciliation"
  );
});

it("clears findings on tenant switch and fetches only after another click", async () => {
  const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    const token = (options?.headers as Record<string, string>).Authorization;
    return response(
      token === "Bearer tenant-b"
        ? { ...report, catalogCount: 0, checkedCount: 0, findings: [] }
        : report
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(
    <TenantStorageReconciliationView accessToken="tenant-a" />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Conferir arquivos desta empresa" })
  );
  expect(await screen.findByText(/Arquivo ausente/)).toBeInTheDocument();
  rerender(<TenantStorageReconciliationView accessToken="tenant-b" />);
  await waitFor(() =>
    expect(screen.queryByText(/Arquivo ausente/)).not.toBeInTheDocument()
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Conferir arquivos desta empresa" })
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/Arquivo ausente/)).not.toBeInTheDocument();
});

it("shows unavailable storage without claiming that files were inspected", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response({
        ...report,
        configured: false,
        catalogCount: 2,
        checkedCount: 0,
        complete: false,
        findings: [],
      })
    )
  );
  render(<TenantStorageReconciliationView accessToken="tenant-a" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Conferir arquivos desta empresa" })
  );
  expect(
    await screen.findByText(/Nenhum arquivo foi verificado/)
  ).toBeInTheDocument();
});

it("loads later pages on demand and accumulates only this tenant's findings", async () => {
  const cursor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const first = {
    ...report,
    catalogCount: 53,
    checkedCount: 50,
    complete: false,
    nextCursor: cursor,
    matchingCount: 49,
  };
  const second = {
    ...report,
    catalogCount: 53,
    checkedCount: 3,
    complete: true,
    nextCursor: null,
    matchingCount: 2,
    findings: [
      {
        backupId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        status: "MISSING",
        catalogBytes: "5",
        filesystemBytes: null,
      },
    ],
  };
  const fetchMock = vi.fn(async (_url: string) =>
    response(fetchMock.mock.calls.length === 1 ? first : second)
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<TenantStorageReconciliationView accessToken="tenant-a" />);

  fireEvent.click(
    screen.getByRole("button", { name: "Conferir arquivos desta empresa" })
  );
  expect(await screen.findByRole("button", { name: "Conferir próximo lote" }))
    .toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Conferir próximo lote" })
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock.mock.calls[1]?.[0]).toContain(
    `/admin/storage/reconciliation?cursor=${cursor}`
  );
  expect(
    await screen.findByText(/Todos os lotes disponíveis foram conferidos/)
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Conferir próximo lote" }))
    .not.toBeInTheDocument();
  const summary = screen.getByText(/Arquivos conferidos:/).textContent;
  expect(summary).toContain("53 de 53");
  expect(summary).toContain("Correspondências: 51");
  expect(summary).toContain("Ausentes: 2");
  expect(screen.getAllByText(/Arquivo ausente/)).toHaveLength(2);
});
