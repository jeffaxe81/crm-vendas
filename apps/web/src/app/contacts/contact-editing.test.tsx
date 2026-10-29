import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactsView } from "./contacts-view";

const accessToken = "contact-edit-access";
const organizationId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";
const contactId = "55555555-5555-4555-8555-555555555555";
const channelId = "66666666-6666-4666-8666-666666666666";

const contact = {
  id: contactId,
  organizationId,
  fullName: "Ana Silva",
  jobTitle: "Compradora",
  notes: null,
  version: 1,
  createdBy: userId,
  updatedBy: userId,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-10-29T12:00:00.000Z",
  updatedAt: "2026-10-29T12:00:00.000Z",
  relationshipEntries: [],
  channels: [
    {
      id: channelId,
      organizationId,
      contactId,
      type: "EMAIL",
      value: "ana@example.test",
      label: "Trabalho",
      isPrimary: true,
      createdAt: "2026-10-29T12:00:00.000Z",
      updatedAt: "2026-10-29T12:00:00.000Z",
    },
  ],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("contact editing", () => {
  it("edits the contact name and job title through PATCH /contacts/:id", async () => {
    const updated = {
      ...contact,
      fullName: "Ana Silva Souza",
      jobTitle: "Gerente de Compras",
      version: 2,
      updatedAt: "2026-10-29T12:10:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [contact], page: 1, limit: 20, total: 1 })
      )
      .mockResolvedValueOnce(
        response({ items: [], page: 1, limit: 100, total: 0 })
      )
      .mockResolvedValueOnce(response(updated));
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactsView accessToken={accessToken} />);

    const card = (await screen.findByText("Ana Silva")).closest("article");
    expect(card).not.toBeNull();

    fireEvent.click(
      within(card as HTMLElement).getByRole("button", {
        name: "Editar contato",
      })
    );

    const form = screen.getByRole("form", { name: "Editar contato" });
    fireEvent.change(within(form).getByLabelText("Nome completo"), {
      target: { value: "Ana Silva Souza" },
    });
    fireEvent.change(within(form).getByLabelText("Cargo"), {
      target: { value: "Gerente de Compras" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Salvar alterações" })
    );

    expect(await screen.findByText("Ana Silva Souza")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(`/contacts/${contactId}`),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            fullName: "Ana Silva Souza",
            jobTitle: "Gerente de Compras",
          }),
        })
      );
    });
  });

  it(
    "edits an existing channel through PATCH /contacts/:id/channels/:channelId",
    async () => {
    const updatedChannel = {
      ...contact.channels[0],
      value: "ana.souza@example.test",
      label: "Corporativo",
      updatedAt: "2026-10-29T12:15:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [contact], page: 1, limit: 20, total: 1 })
      )
      .mockResolvedValueOnce(
        response({ items: [], page: 1, limit: 100, total: 0 })
      )
      .mockResolvedValueOnce(response(updatedChannel));
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactsView accessToken={accessToken} />);

    const card = (await screen.findByText("Ana Silva")).closest("article");
    expect(card).not.toBeNull();

    fireEvent.click(
      within(card as HTMLElement).getByRole("button", {
        name: "Editar canal Trabalho",
      })
    );

    const form = screen.getByRole("form", { name: "Editar canal" });
    fireEvent.change(within(form).getByLabelText("Valor"), {
      target: { value: "ana.souza@example.test" },
    });
    fireEvent.change(within(form).getByLabelText("Rótulo"), {
      target: { value: "Corporativo" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Salvar alterações" })
    );

    expect(
      await screen.findByText("ana.souza@example.test")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        `/contacts/${contactId}/channels/${channelId}`
      ),
      expect.objectContaining({ method: "PATCH" })
    );
    }
  );
});