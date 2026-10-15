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
import { BackupAdministrationView } from "./backup-administration-view";

const schedule = {
  enabled: false,
  frequency: "DAILY",
  localTime: "02:00",
  weekday: 0,
  intervalMinutes: null,
  retentionCount: 15,
  timezone: "America/Sao_Paulo",
  nextRunAt: null,
};

const operation = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  state: "RUNNING",
  stage: "BACKUP_STARTED",
  processed: 0,
  total: null,
  errorCode: null,
  createdAt: "2026-10-13T20:00:00.000Z",
  completedAt: null,
};

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("disables backup creation when the encrypted store is not configured", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/admin/backups/operations")) {
      return jsonResponse([]);
    }
    if (url.endsWith("/admin/backups/schedule")) {
      return jsonResponse(schedule);
    }
    if (url.endsWith("/admin/backups")) {
      return jsonResponse({ configured: false, backups: [] });
    }
    throw Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<BackupAdministrationView accessToken="synthetic-token" />);

  expect(
    await screen.findByText(/Armazenamento ainda não habilitado/)
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Criar backup agora" })
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: /restaurar dados/i })
  ).not.toBeInTheDocument();
});

it("creates a queued manual backup using the authenticated API", async () => {
  let queued = false;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/admin/backups/operations")) {
      return jsonResponse(queued ? [{ ...operation, state: "PENDING" }] : []);
    }
    if (url.endsWith("/admin/backups/schedule")) {
      return jsonResponse(schedule);
    }
    if (url.endsWith("/admin/backups") && init?.method === "POST") {
      queued = true;
      return jsonResponse({ id: operation.id, state: "PENDING" });
    }
    if (url.endsWith("/admin/backups")) {
      return jsonResponse({ configured: true, backups: [] });
    }
    throw Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<BackupAdministrationView accessToken="synthetic-token" />);
  const button = screen.getByRole("button", { name: "Criar backup agora" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);

  expect(await screen.findByText(/Backup solicitado/)).toBeInTheDocument();
  expect(await screen.findByText(/Aguardando/)).toBeInTheDocument();
  const mutation = fetchMock.mock.calls.find(
    ([url, init]) => url.endsWith("/admin/backups") && init?.method === "POST"
  );
  expect(mutation).toBeDefined();
  expect(mutation?.[1]?.headers).toEqual(
    expect.objectContaining({ Authorization: "Bearer synthetic-token" })
  );
});

it("polls a running operation and stops after completion", async () => {
  let operationFetches = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/admin/backups/operations")) {
      operationFetches++;
      return jsonResponse([
        {
          ...operation,
          state: operationFetches === 1 ? "RUNNING" : "COMPLETED",
        },
      ]);
    }
    if (url.endsWith("/admin/backups/schedule")) {
      return jsonResponse(schedule);
    }
    if (url.endsWith("/admin/backups")) {
      return jsonResponse({ configured: true, backups: [] });
    }
    throw Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  vi.useFakeTimers();
  await act(async () => {
    render(<BackupAdministrationView accessToken="synthetic-token" />);
  });
  expect(screen.getByText(/Executando/)).toBeInTheDocument();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(operationFetches).toBe(2);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
  expect(operationFetches).toBe(2);
});

const completedBackup = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  actorUserId: null,
  reason: "MANUAL",
  state: "COMPLETED",
  schemaVersion: 1,
  checksum: "a".repeat(64),
  byteCount: 1024,
  counts: {},
  errorCode: null,
  createdAt: "2026-10-15T12:00:00.000Z",
  completedAt: "2026-10-15T12:00:01.000Z",
};

it("requires explicit confirmation tied to the selected backup and then polls deletion", async () => {
  let deleted = false;
  let catalogCalls = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (
      url.endsWith(`/admin/backups/${completedBackup.id}`) &&
      init?.method === "DELETE"
    ) {
      expect(JSON.parse(init.body as string)).toEqual({
        confirmation: "EXCLUIR BACKUP",
        checksum: completedBackup.checksum,
      });
      deleted = true;
      return jsonResponse({ id: completedBackup.id, state: "DELETING" });
    }
    if (url.endsWith("/admin/backups/operations")) return jsonResponse([]);
    if (url.endsWith("/admin/backups/schedule")) return jsonResponse(schedule);
    if (url.endsWith("/admin/backups")) {
      catalogCalls++;
      return jsonResponse({
        configured: true,
        backups: [
          { ...completedBackup, state: deleted ? "DELETING" : "COMPLETED" },
        ],
      });
    }
    throw Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<BackupAdministrationView accessToken="synthetic-token" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Excluir backup" })
  );
  const confirmation = screen.getByRole("region", { name: "Excluir backup" });
  expect(
    within(confirmation).getByText(completedBackup.id)
  ).toBeInTheDocument();
  const submit = within(confirmation).getByRole("button", {
    name: "Confirmar exclusão",
  });
  expect(submit).toBeDisabled();
  fireEvent.change(
    within(confirmation).getByLabelText(/Digite EXCLUIR BACKUP/),
    { target: { value: "EXCLUIR BACKUP" } }
  );
  fireEvent.click(submit);
  expect(await screen.findByText(/Exclusão solicitada/)).toBeInTheDocument();
  expect(await screen.findByText(/Exclusão pendente/)).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Excluir backup" })
  ).not.toBeInTheDocument();
  expect(catalogCalls).toBeGreaterThan(1);
  expect(
    fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE")?.[1]
      ?.headers
  ).toEqual(
    expect.objectContaining({ Authorization: "Bearer synthetic-token" })
  );
});

it("cancels deletion without making a destructive request", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/operations")) return jsonResponse([]);
    if (url.endsWith("/schedule")) return jsonResponse(schedule);
    return jsonResponse({ configured: true, backups: [completedBackup] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<BackupAdministrationView accessToken="synthetic-token" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Excluir backup" })
  );
  const confirmation = screen.getByRole("region", { name: "Excluir backup" });
  fireEvent.click(
    within(confirmation).getByRole("button", { name: "Cancelar" })
  );
  expect(
    screen.queryByRole("region", { name: "Excluir backup" })
  ).not.toBeInTheDocument();
  expect(
    fetchMock.mock.calls.some(
      (args: unknown[]) =>
        (args[1] as RequestInit | undefined)?.method === "DELETE"
    )
  ).toBe(false);
});

it("polls a pending deletion and stops after the file is removed", async () => {
  let catalogCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/operations")) return jsonResponse([]);
      if (url.endsWith("/schedule")) return jsonResponse(schedule);
      catalogCalls++;
      return jsonResponse({
        configured: true,
        backups: [
          {
            ...completedBackup,
            state: catalogCalls === 1 ? "DELETING" : "DELETED",
          },
        ],
      });
    })
  );
  vi.useFakeTimers();
  await act(async () => {
    render(<BackupAdministrationView accessToken="synthetic-token" />);
  });
  expect(screen.getByText(/Exclusão pendente/)).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(catalogCalls).toBe(2);
  expect(screen.getByText(/Excluído/)).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
  expect(catalogCalls).toBe(2);
  expect(
    screen.queryByRole("button", { name: "Baixar" })
  ).not.toBeInTheDocument();
});

it("keeps the confirmation available and reports a rejected deletion", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return {
          ok: false,
          status: 409,
          json: async () => ({
            message: "O backup mais recente está protegido.",
          }),
        } as Response;
      if (url.endsWith("/operations")) return jsonResponse([]);
      if (url.endsWith("/schedule")) return jsonResponse(schedule);
      return jsonResponse({ configured: true, backups: [completedBackup] });
    })
  );
  const { rerender } = render(
    <BackupAdministrationView accessToken="synthetic-token" />
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Excluir backup" })
  );
  fireEvent.change(screen.getByLabelText(/Digite EXCLUIR BACKUP/), {
    target: { value: "EXCLUIR BACKUP" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  expect(
    await screen.findByText("O backup mais recente está protegido.")
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Excluir backup" })
  ).toBeInTheDocument();
  expect(screen.queryByText(/Exclusão solicitada/)).not.toBeInTheDocument();
  rerender(
    <BackupAdministrationView accessToken="another-organization-token" />
  );
  expect(
    screen.queryByRole("region", { name: "Excluir backup" })
  ).not.toBeInTheDocument();
});
