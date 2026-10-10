import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebhookSubscriptionsView } from "./webhook-subscriptions-view";

const subscription = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ERP",
  targetUrl: "https://erp.example.com/webhook",
  eventTypes: ["company.created"],
  isActive: true,
  version: 1,
  createdAt: "2026-10-09T10:00:00.000Z",
  updatedAt: "2026-10-09T10:00:00.000Z",
};
const dispatch = {
  id: "22222222-2222-4222-8222-222222222222",
  subscriptionId: subscription.id,
  eventId: "33333333-3333-4333-8333-333333333333",
  eventType: "webhook.test",
  status: "PENDING",
  attemptCount: 0,
  nextAttemptAt: "2026-10-09T10:00:00.000Z",
  lastErrorCode: null,
  createdAt: "2026-10-09T10:00:00.000Z",
  updatedAt: "2026-10-09T10:00:00.000Z",
  deliveries: [],
};
function response(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as Response;
}
function setup(handler: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      requests.push({ path, init });
      return handler(path, init);
    })
  );
  return requests;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("C6 webhook administration", () => {
  it("lists webhooks without permitting writes to read-only users", async () => {
    const calls = setup(() => response([subscription]));
    render(<WebhookSubscriptionsView accessToken="tenant-a" canManage={false} />);
    expect(await screen.findByText("ERP")).toBeVisible();
    expect(screen.getByRole("button", { name: "Histórico webhook ERP" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Editar webhook ERP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Testar webhook ERP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar webhook" })).not.toBeInTheDocument();
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe("Bearer tenant-a");
  });

  it("creates a webhook and reveals its secret exactly until dismissed", async () => {
    const calls = setup((_path, init) =>
      init?.method === "POST"
        ? response({ ...subscription, plainSecret: "whsec_only_once" }, 201)
        : response([])
    );
    render(<WebhookSubscriptionsView accessToken="tenant-a" canManage />);
    await screen.findByText("Nenhum webhook cadastrado.");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "ERP" } });
    fireEvent.change(screen.getByLabelText("Destino HTTPS"), {
      target: { value: subscription.targetUrl },
    });
    fireEvent.click(screen.getByLabelText("Empresa criada"));
    fireEvent.click(screen.getByRole("button", { name: "Criar webhook" }));
    expect(await screen.findByLabelText("Segredo de assinatura")).toHaveTextContent("whsec_only_once");
    const create = calls.find(call => call.init?.method === "POST");
    expect(JSON.parse(String(create?.init?.body))).toEqual({
      name: "ERP",
      targetUrl: subscription.targetUrl,
      eventTypes: ["company.created"],
    });
    expect(Object.values(localStorage).join(" ")).not.toContain("whsec_only_once");
    fireEvent.click(screen.getByRole("button", { name: "Já guardei o segredo" }));
    expect(screen.queryByLabelText("Segredo de assinatura")).not.toBeInTheDocument();
  });

  it("edits a subscription with version and only updates after the API confirms", async () => {
    let commitUpdate: ((value: Response) => void) | undefined;
    const requests = setup((_path, init) =>
      init?.method === "PATCH"
        ? new Promise<Response>(resolve => { commitUpdate = resolve; })
        : response([subscription])
    );
    render(<WebhookSubscriptionsView accessToken="tenant-a" canManage />);
    await screen.findByText("ERP");
    fireEvent.click(screen.getByRole("button", { name: "Editar webhook ERP" }));
    fireEvent.change(screen.getByLabelText("Nome da assinatura"), {
      target: { value: "ERP atualizado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(requests.some(call => call.init?.method === "PATCH")).toBe(true));
    const update = requests.find(call => call.init?.method === "PATCH");
    expect(JSON.parse(String(update?.init?.body))).toEqual({
      version: 1,
      name: "ERP atualizado",
      targetUrl: subscription.targetUrl,
      eventTypes: ["company.created"],
    });
    expect(screen.queryByText("ERP atualizado")).not.toBeInTheDocument();
    commitUpdate?.(response({ ...subscription, version: 2, name: "ERP atualizado" }));
    expect(await screen.findByText("ERP atualizado")).toBeVisible();
    expect(screen.queryByRole("form", { name: "Editar webhook ERP" })).not.toBeInTheDocument();
  });

  it("requires confirmation to deactivate and disables tests of inactive hooks", async () => {
    const calls = setup((_path, init) =>
      init?.method === "PATCH"
        ? response({ ...subscription, version: 2, isActive: false })
        : response([subscription])
    );
    render(<WebhookSubscriptionsView accessToken="tenant-a" canManage />);
    await screen.findByText("ERP");
    fireEvent.click(screen.getByRole("button", { name: "Desativar webhook ERP" }));
    expect(calls.filter(call => call.init?.method === "PATCH")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar desativação" }));
    await screen.findByText("Inativo");
    expect(JSON.parse(String(calls.find(call => call.init?.method === "PATCH")?.init?.body))).toEqual({
      version: 1,
      isActive: false,
    });
    expect(screen.getByRole("button", { name: "Testar webhook ERP" })).toBeDisabled();
  });

  it("queues a test and displays delivery metadata without storing payload or secrets", async () => {
    const calls = setup((path, init) => {
      if (init?.method === "POST" && path.endsWith("/test"))
        return response(dispatch);
      if (path.endsWith("/deliveries"))
        return response([{
          ...dispatch,
          status: "DELIVERED",
          attemptCount: 1,
          nextAttemptAt: null,
          deliveries: [{
            id: "44444444-4444-4444-8444-444444444444",
            attempt: 1,
            status: "DELIVERED",
            responseStatus: 204,
            errorCode: null,
            createdAt: "2026-10-09T10:01:00.000Z",
          }],
        }]);
      return response([subscription]);
    });
    render(<WebhookSubscriptionsView accessToken="tenant-a" canManage />);
    await screen.findByText("ERP");
    fireEvent.click(screen.getByRole("button", { name: "Testar webhook ERP" }));
    expect(await screen.findByText(/Teste enfileirado/)).toBeVisible();
    expect(calls.find(call => call.init?.method === "POST")?.path).toBe(
      `/api/v1/integrations/webhooks/${subscription.id}/test`
    );
    fireEvent.click(screen.getByRole("button", { name: "Histórico webhook ERP" }));
    expect(await screen.findByText("webhook.test")).toBeVisible();
    expect(screen.getByText(/HTTP 204/)).toBeVisible();
    expect(calls.some(call => call.path.endsWith("/deliveries"))).toBe(true);
  });

  it("refreshes on optimistic locking conflicts without pretending the update succeeded", async () => {
    let current = { ...subscription };
    const calls = setup((_path, init) => {
      if (init?.method === "PATCH") {
        current = { ...current, name: "Atualizado por outro operador", version: 2 };
        return response({ message: "Version conflict" }, 409);
      }
      return response([current]);
    });
    render(<WebhookSubscriptionsView accessToken="tenant-a" canManage />);
    await screen.findByText("ERP");
    fireEvent.click(screen.getByRole("button", { name: "Desativar webhook ERP" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar desativação" }));
    expect(await screen.findByText(/Lista atualizada/)).toBeVisible();
    expect(await screen.findByText("Atualizado por outro operador")).toBeVisible();
    expect(screen.queryByText("Inativo")).not.toBeInTheDocument();
    expect(calls.filter(call => call.init?.method === "PATCH")).toHaveLength(1);
  });

  it("clears secret and organization data immediately when the access token changes", async () => {
    const calls = setup((_path, init) => {
      const token = new Headers(init?.headers).get("Authorization");
      if (init?.method === "POST")
        return response({ ...subscription, plainSecret: "whsec_tenant_a" }, 201);
      return response(token === "Bearer tenant-a" ? [] : [{ ...subscription, id: "55555555-5555-4555-8555-555555555555", name: "Empresa B" }]);
    });
    const view = render(<WebhookSubscriptionsView accessToken="tenant-a" canManage />);
    await screen.findByText("Nenhum webhook cadastrado.");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "ERP" } });
    fireEvent.change(screen.getByLabelText("Destino HTTPS"), { target: { value: subscription.targetUrl } });
    fireEvent.click(screen.getByLabelText("Empresa criada"));
    fireEvent.click(screen.getByRole("button", { name: "Criar webhook" }));
    expect(await screen.findByLabelText("Segredo de assinatura")).toHaveTextContent("whsec_tenant_a");
    view.rerender(<WebhookSubscriptionsView accessToken="tenant-b" canManage />);
    expect(screen.queryByText("whsec_tenant_a")).not.toBeInTheDocument();
    expect(screen.queryByText("ERP")).not.toBeInTheDocument();
    expect(await screen.findByText("Empresa B")).toBeVisible();
    expect(calls.some(call => new Headers(call.init?.headers).get("Authorization") === "Bearer tenant-b")).toBe(true);
  });
});
