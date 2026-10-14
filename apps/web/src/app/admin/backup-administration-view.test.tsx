import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    if (url.endsWith("/admin/backups/operations"))
      return jsonResponse([]);
    if (url.endsWith("/admin/backups/schedule"))
      return jsonResponse(schedule);
    if (url.endsWith("/admin/backups"))
      return jsonResponse({ configured: false, backups: [] });
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
    if (url.endsWith("/admin/backups/operations"))
      return jsonResponse(queued ? [{ ...operation, state: "PENDING" }] : []);
    if (url.endsWith("/admin/backups/schedule"))
      return jsonResponse(schedule);
    if (url.endsWith("/admin/backups") && init?.method === "POST") {
      queued = true;
      return jsonResponse({ id: operation.id, state: "PENDING" });
    }
    if (url.endsWith("/admin/backups"))
      return jsonResponse({ configured: true, backups: [] });
    throw Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<BackupAdministrationView accessToken="synthetic-token" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Criar backup agora" })
  );

  expect(await screen.findByText(/Backup solicitado/)).toBeInTheDocument();
  expect(await screen.findByText(/Aguardando/)).toBeInTheDocument();
  const mutation = fetchMock.mock.calls.find(
    ([url, init]) =>
      url.endsWith("/admin/backups") && init?.method === "POST"
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
    if (url.endsWith("/admin/backups/schedule"))
      return jsonResponse(schedule);
    if (url.endsWith("/admin/backups"))
      return jsonResponse({ configured: true, backups: [] });
    throw Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<BackupAdministrationView accessToken="synthetic-token" />);
  expect(await screen.findByText(/Executando/)).toBeInTheDocument();

  vi.useFakeTimers();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(operationFetches).toBe(2);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
  expect(operationFetches).toBe(2);
});
