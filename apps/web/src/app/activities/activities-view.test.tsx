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
const emptyActivities = { items: [], page: 1, limit: 20, total: 0 };

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

describe("C3.5.4 activities filters", () => {
  it("switches status through the API", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) =>
      response(emptyActivities)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calls.some(url => url.includes("status=PENDING"))).toBe(true);
    });

    const completedButton = await screen.findByRole("button", {
      name: "Concluídas",
    });
    fireEvent.click(completedButton);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calls.some(url => url.includes("status=COMPLETED"))).toBe(true);
    });
  });

  it("sends title search through the API only after submit", async () => {
    const fetchMock = vi.fn(async (_input: string | URL) =>
      response(emptyActivities)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivitiesView
        accessToken={accessToken}
        ownerUserId={ownerUserId}
        canWrite
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    fetchMock.mockClear();

    const searchInput = screen.getByRole("searchbox", {
      name: "Buscar atividades",
    });
    fireEvent.change(searchInput, { target: { value: "proposta" } });

    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calls.some(url => url.includes("q=proposta"))).toBe(true);
    });
  });
});
