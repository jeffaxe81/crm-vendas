import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunitiesView } from "./opportunities-view";

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

describe("C3.6.5 opportunity creation", () => {
  it("shows the create action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({ items: [], page: 1, limit: 20, total: 0 })
      )
    );

    render(<OpportunitiesView accessToken="opportunities-access-token" />);

    await screen.findByText("Nenhuma oportunidade encontrada.");

    expect(
      screen.getByRole("button", { name: "Nova oportunidade" })
    ).toBeInTheDocument();
  });
});
