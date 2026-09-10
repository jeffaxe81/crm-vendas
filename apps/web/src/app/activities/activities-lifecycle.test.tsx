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
});
