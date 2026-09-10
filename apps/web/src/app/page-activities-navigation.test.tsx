import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const baseSession = {
  accessToken: "c3-5-4-access-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "seller@axes.test",
    displayName: "Vendedor Axes",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Axesistemas",
    slug: "axesistemas",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "SELLER",
  },
};

const sessionWithActivities = {
  ...baseSession,
  permissions: [
    "company.read",
    "contact.read",
    "activity.read",
    "activity.write",
  ],
};

const sessionWithoutActivities = {
  ...baseSession,
  permissions: ["company.read", "contact.read"],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const emptyCompanies = { items: [], page: 1, limit: 20, total: 0 };
const emptyActivities = { items: [], page: 1, limit: 20, total: 0 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function authenticate(session: typeof sessionWithActivities) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url.endsWith("/auth/refresh")) {
      return response({}, 401);
    }
    if (url.endsWith("/auth/login")) {
      return response(session);
    }
    if (url.includes("/companies?")) {
      return response(emptyCompanies);
    }
    if (url.includes("/activities?")) {
      return response(emptyActivities);
    }

    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<Home />);

  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: session.user.email },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "example-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar no CRM" }));

  await screen.findByText(session.organization.name);
  return fetchMock;
}

describe("C3.5.4 activities navigation", () => {
  it("opens activities when the session has activity.read", async () => {
    await authenticate(sessionWithActivities);

    const activitiesNavigation = await screen.findByRole("button", {
      name: "Atividades",
    });
    fireEvent.click(activitiesNavigation);

    expect(
      await screen.findByRole("heading", { name: "Atividades e compromissos" })
    ).toBeInTheDocument();
  });

  it("hides activities when the session lacks activity.read", async () => {
    await authenticate(sessionWithoutActivities);

    expect(
      screen.queryByRole("button", { name: "Atividades" })
    ).not.toBeInTheDocument();
  });
});
