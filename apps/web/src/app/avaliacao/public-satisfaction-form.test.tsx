import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicSatisfactionForm } from "./public-satisfaction-form";
import SatisfactionPage from "./[token]/page";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const TOKEN = "Abc_-".padEnd(43, "x");

const info = {
  protocol: "2026-000042",
  subject: "Ramal sem áudio",
  organizationName: "Axesistemas",
  expiresAt: "2026-10-03T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C5.4 public satisfaction page", () => {
  it("shows only protocol, subject and organization, then submits once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(info))
      .mockResolvedValueOnce(
        response({ rating: 4, respondedAt: "2026-09-27T12:00:00.000Z" }, 201)
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicSatisfactionForm token={TOKEN} />);
    const form = await screen.findByRole("form", {
      name: "Avaliação do atendimento",
    });
    expect(screen.getByText("Axesistemas")).toBeInTheDocument();
    expect(screen.getByText("2026-000042")).toBeInTheDocument();
    expect(within(form).getAllByRole("radio")).toHaveLength(5);

    fireEvent.click(
      within(form).getByRole("button", { name: "Enviar avaliação" })
    );
    expect(
      await screen.findByText("Escolha uma nota de 1 a 5.")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(form).getByLabelText("4 — Satisfeito"));
    fireEvent.change(within(form).getByLabelText("Comentário (opcional)"), {
      target: { value: "  Rápido e cordial " },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Enviar avaliação" })
    );

    expect(
      await screen.findByText("Obrigado! Sua avaliação foi registrada.")
    ).toBeInTheDocument();
    const [getUrl, getInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(getUrl).toContain(`/public/satisfaction/${TOKEN}`);
    expect(
      (getInit.headers as Record<string, string>).Authorization
    ).toBeUndefined();
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(postUrl).toContain(`/public/satisfaction/${TOKEN}`);
    expect(postInit.method).toBe("POST");
    expect(JSON.parse(String(postInit.body))).toEqual({
      rating: 4,
      comment: "Rápido e cordial",
    });
  });

  it.each([
    [404, "Link de avaliação inválido. Confira o endereço recebido."],
    [409, "Esta avaliação já foi respondida. Obrigado!"],
    [410, "Este link de avaliação expirou."],
  ])("explains a %s without showing the form", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ message: "interno" }, status))
    );
    render(<PublicSatisfactionForm token={TOKEN} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(
      screen.queryByRole("form", { name: "Avaliação do atendimento" })
    ).toBeNull();
  });

  it("handles an answer registered meanwhile (409 on submit)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(info))
        .mockResolvedValueOnce(response({ message: "x" }, 409))
    );
    render(<PublicSatisfactionForm token={TOKEN} />);
    const form = await screen.findByRole("form", {
      name: "Avaliação do atendimento",
    });
    fireEvent.click(within(form).getByLabelText("5 — Muito satisfeito"));
    fireEvent.click(
      within(form).getByRole("button", { name: "Enviar avaliação" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta avaliação já foi respondida. Obrigado!"
    );
    expect(
      screen.queryByRole("form", { name: "Avaliação do atendimento" })
    ).toBeNull();
  });

  it("renders the route page from the token param without login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(info)));
    render(
      await SatisfactionPage({ params: Promise.resolve({ token: TOKEN }) })
    );
    expect(
      await screen.findByRole("heading", { name: "Avalie o atendimento" })
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Ramal sem áudio", { exact: false })
    ).toBeInTheDocument();
  });
});
