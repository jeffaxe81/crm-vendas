import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivitiesView } from "./activities-view";

const accessToken = "activities-access-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    json: async () => undefined,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C3.5.4 activity lifecycle", () => {
  it("completes a pending activity and reloads the current list", async () => {
    const activity = {
      id: "44444444-4444-4444-8444-444444444444",
      type: "TASK",
      status: "PENDING",
      priority: "MEDIUM",
      title: "Follow-up cliente",
      description: null,
      ownerUserId,
      companyId: null,
      contactId: null,
      dueAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    let reads = 0;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/activities?")) {
        reads += 1;
        return response({
          items: reads === 1 ? [activity] : [],
          page: 1,
          limit: 20,
          total: reads === 1 ? 1 : 0,
        });
      }

      if (
        url.endsWith(`/activities/${activity.id}`) &&
        init?.method === "PATCH"
      ) {
        return response({ ...activity, status: "COMPLETED" });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    expect(await screen.findByText("Follow-up cliente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(`/activities/${activity.id}`) &&
          init?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        status: "COMPLETED",
      });
      expect(reads).toBeGreaterThanOrEqual(2);
    });
  });

  it("cancels a pending activity and reloads the current list", async () => {
    const activity = {
      id: "55555555-5555-4555-8555-555555555555",
      type: "APPOINTMENT",
      status: "PENDING",
      priority: "HIGH",
      title: "Reunião comercial",
      description: null,
      ownerUserId,
      companyId: null,
      contactId: null,
      dueAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    let reads = 0;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/activities?")) {
        reads += 1;
        return response({
          items: reads === 1 ? [activity] : [],
          page: 1,
          limit: 20,
          total: reads === 1 ? 1 : 0,
        });
      }

      if (
        url.endsWith(`/activities/${activity.id}`) &&
        init?.method === "PATCH"
      ) {
        return response({ ...activity, status: "CANCELLED" });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    expect(await screen.findByText("Reunião comercial")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar atividade" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(`/activities/${activity.id}`) &&
          init?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        status: "CANCELLED",
      });
      expect(reads).toBeGreaterThanOrEqual(2);
    });
  });

  it("reopens a completed activity and reloads the completed list", async () => {
    const activity = {
      id: "66666666-6666-4666-8666-666666666666",
      type: "TASK",
      status: "COMPLETED",
      priority: "LOW",
      title: "Proposta concluída",
      description: null,
      ownerUserId,
      companyId: null,
      contactId: null,
      dueAt: null,
      completedAt: "2026-09-10T10:00:00.000Z",
      cancelledAt: null,
    };
    let completedReads = 0;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/activities?") && url.includes("status=PENDING")) {
        return response({ items: [], page: 1, limit: 20, total: 0 });
      }

      if (url.includes("/activities?") && url.includes("status=COMPLETED")) {
        completedReads += 1;
        return response({
          items: completedReads === 1 ? [activity] : [],
          page: 1,
          limit: 20,
          total: completedReads === 1 ? 1 : 0,
        });
      }

      if (
        url.endsWith(`/activities/${activity.id}`) &&
        init?.method === "PATCH"
      ) {
        return response({
          ...activity,
          status: "PENDING",
          completedAt: null,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await screen.findByText("Nenhuma atividade em pendentes.");
    fireEvent.click(screen.getByRole("button", { name: "Concluídas" }));

    expect(await screen.findByText("Proposta concluída")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(`/activities/${activity.id}`) &&
          init?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        status: "PENDING",
      });
      expect(completedReads).toBeGreaterThanOrEqual(2);
    });
  });

  it("inactivates an activity and reloads the current list", async () => {
    const activity = {
      id: "77777777-7777-4777-8777-777777777777",
      type: "TASK",
      status: "PENDING",
      priority: "MEDIUM",
      title: "Atividade obsoleta",
      description: null,
      ownerUserId,
      companyId: null,
      contactId: null,
      dueAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    let reads = 0;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith(`/activities/${activity.id}`) &&
        init?.method === "DELETE"
      ) {
        return noContentResponse();
      }

      if (url.includes("/activities?")) {
        reads += 1;
        return response({
          items: reads === 1 ? [activity] : [],
          page: 1,
          limit: 20,
          total: reads === 1 ? 1 : 0,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    expect(await screen.findByText("Atividade obsoleta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inativar" }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(`/activities/${activity.id}`) &&
          init?.method === "DELETE"
      );
      expect(deleteCall).toBeDefined();
      expect(reads).toBeGreaterThanOrEqual(2);
    });
  });
});
