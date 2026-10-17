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
