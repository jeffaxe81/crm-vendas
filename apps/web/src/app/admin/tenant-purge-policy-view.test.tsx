import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TenantPurgePolicyView } from "./tenant-purge-policy-view";

const policy = {
  enabled: false,
  retentionDays: 180,
  lastRunAt: null,
  target: "EXPIRED_OPERATION_PREVIEWS",
  estimatedRecords: 3,
  cutoff: "2026-04-20T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

it("keeps purge disabled until explicit confirmation and saves only current tenant", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.endsWith("/admin/purge/policy")) throw Error("wrong url");
    if (init?.method === "PUT") {
      expect(init?.headers).toEqual(
        expect.objectContaining({ Authorization: "Bearer tenant-a-token" })
      );
      expect(JSON.parse(init?.body as string)).toEqual({
        enabled: true,
        retentionDays: 90,
        confirmation: "ATIVAR EXPURGO",
      });
      return response({ ...policy, enabled: true, retentionDays: 90 });
    }
    return response(policy);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<TenantPurgePolicyView accessToken="tenant-a-token" />);

  expect(await screen.findByText(/Registros técnicos elegíveis no momento/)).toHaveTextContent("3");
  const save = screen.getByRole("button", { name: "Salvar política de expurgo" });
  const checkbox = screen.getByRole("checkbox", {
    name: /Ativar expurgo automático somente nesta empresa/,
  });
  expect(checkbox).not.toBeChecked();
  fireEvent.click(checkbox);
  expect(save).toBeDisabled();
  fireEvent.change(
    screen.getByLabelText("Prazo de retenção dos registros técnicos"),
    { target: { value: "90" } }
  );
  fireEvent.change(
    screen.getByLabelText("Digite ATIVAR EXPURGO para confirmar"),
    { target: { value: "ATIVAR EXPURGO" } }
  );
  fireEvent.click(save);
  expect(
    await screen.findByText("Política de expurgo da empresa salva com sucesso.")
  ).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
});

it("switches tenant policy when credential changes without leaking previous configuration", async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    response(
      (init?.headers as Record<string, string> | undefined)?.Authorization ===
        "Bearer tenant-b-token"
        ? { ...policy, retentionDays: 365, estimatedRecords: 0 }
        : policy
    )
  );
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(
    <TenantPurgePolicyView accessToken="tenant-a-token" />
  );
  expect(await screen.findByText(/Registros técnicos elegíveis no momento/)).toHaveTextContent("3");
  rerender(<TenantPurgePolicyView accessToken="tenant-b-token" />);
  await waitFor(() =>
    expect(screen.getByText(/Registros técnicos elegíveis no momento/)).toHaveTextContent("0")
  );
  expect(
    screen.getByLabelText("Prazo de retenção dos registros técnicos")
  ).toHaveValue("365");
});
