import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TenantStorageAllocationView } from "./tenant-storage-allocation-view";

const initial = {
  allocatedGiB: null,
  usedBytes: "0",
  backupCount: 0,
  usagePercent: null,
  alertLevel: "UNALLOCATED",
  enforced: false,
  scope: "ENCRYPTED_BACKUP_CATALOG",
  updatedAt: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

it("requires confirmation for a custom storage allocation", async () => {
  const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "PUT") {
      expect(
        (options?.headers as Record<string, string>).Authorization
      ).toBe("Bearer first-token");
      expect(JSON.parse(options.body as string)).toEqual({
        allocatedGiB: 64,
        confirmation: "AJUSTAR COTA",
      });
      return response({ ...initial, allocatedGiB: 64, usagePercent: 0, alertLevel: "OK" });
    }
    return response(initial);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<TenantStorageAllocationView accessToken="first-token" />);
  expect(await screen.findByText(/Backups catalogados:/)).toHaveTextContent("0");
  const submit = screen.getByRole("button", {
    name: "Salvar capacidade da empresa",
  });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Capacidade de referência \(GiB/), {
    target: { value: "64" },
  });
  fireEvent.change(screen.getByLabelText("Digite AJUSTAR COTA para confirmar"), {
    target: { value: "AJUSTAR COTA" },
  });
  fireEvent.click(submit);
  expect(
    await screen.findByText("Capacidade de referência da empresa atualizada.")
  ).toBeInTheDocument();
  expect(
    fetchMock.mock.calls.filter(([, options]) => options?.method === "PUT")
  ).toHaveLength(1);
});

it("reloads isolated capacity on tenant switch", async () => {
  const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    const token = (options?.headers as Record<string, string> | undefined)
      ?.Authorization;
    return response(
      token === "Bearer second-token"
        ? { ...initial, allocatedGiB: 10, usagePercent: 80, alertLevel: "WARNING" }
        : initial
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(
    <TenantStorageAllocationView accessToken="first-token" />
  );
  expect(await screen.findByText(/Backups catalogados:/)).toHaveTextContent("0");
  rerender(<TenantStorageAllocationView accessToken="second-token" />);
  await waitFor(() =>
    expect(
      screen.getByLabelText(/Capacidade de referência \(GiB/)
    ).toHaveValue(10)
  );
  expect(screen.getByText(/igual ou superior a 80%/)).toBeInTheDocument();
});
