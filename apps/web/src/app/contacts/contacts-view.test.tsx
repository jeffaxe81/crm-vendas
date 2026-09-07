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
import { CustomFieldsEditor } from "../shared/custom-fields-editor";

const accessToken = "cycle-2-access-token";
const organizationId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";

const company = {
  id: "44444444-4444-4444-8444-444444444444",
  organizationId,
  legalName: "Empresa Relacionada Ltda",
  tradeName: "Empresa Relacionada",
  document: null,
  website: null,
  notes: null,
  version: 1,
  createdBy: userId,
  updatedBy: userId,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
};

const contact = {
  id: "55555555-5555-4555-8555-555555555555",
  organizationId,
  fullName: "Ana Silva",
  jobTitle: "Compradora",
  notes: null,
  version: 1,
  createdBy: userId,
  updatedBy: userId,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-09-07T10:10:00.000Z",
  updatedAt: "2026-09-07T10:10:00.000Z",
  channels: [],
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

describe("Cycle 2 contacts and relationship workspace", () => {
  it("creates an independent contact and adds a channel", async () => {
    const channel = {
      id: "66666666-6666-4666-8666-666666666666",
      organizationId,
      contactId: contact.id,
      type: "EMAIL",
      value: "ana@example.com",
      label: "Trabalho",
      isPrimary: true,
      createdAt: "2026-09-07T10:11:00.000Z",
      updatedAt: "2026-09-07T10:11:00.000Z",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [], page: 1, limit: 20, total: 0 })
      )
      .mockResolvedValueOnce(
        response({ items: [company], page: 1, limit: 100, total: 1 })
      )
      .mockResolvedValueOnce(response(contact, 201))
      .mockResolvedValueOnce(response(channel, 201));
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactsView accessToken={accessToken} />);

    fireEvent.click(screen.getByRole("button", { name: "Novo contato" }));
    const contactForm = screen.getByRole("form", { name: "Novo contato" });
    fireEvent.change(within(contactForm).getByLabelText("Nome completo"), {
      target: { value: "Ana Silva" },
    });
    fireEvent.change(within(contactForm).getByLabelText("Cargo"), {
      target: { value: "Compradora" },
    });
    fireEvent.click(
      within(contactForm).getByRole("button", { name: "Salvar contato" })
    );

    expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/contacts"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          fullName: "Ana Silva",
          jobTitle: "Compradora",
        }),
      })
    );

    const contactCard = screen.getByText("Ana Silva").closest("article");
    expect(contactCard).not.toBeNull();
    fireEvent.click(
      within(contactCard as HTMLElement).getByRole("button", {
        name: "Adicionar canal",
      })
    );

    const channelForm = screen.getByRole("form", { name: "Novo canal" });
    fireEvent.change(within(channelForm).getByLabelText("Tipo"), {
      target: { value: "EMAIL" },
    });
    fireEvent.change(within(channelForm).getByLabelText("Valor"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.change(within(channelForm).getByLabelText("Rótulo"), {
      target: { value: "Trabalho" },
    });
    fireEvent.click(within(channelForm).getByLabelText("Canal principal"));
    fireEvent.click(
      within(channelForm).getByRole("button", { name: "Salvar canal" })
    );

    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(`/contacts/${contact.id}/channels`),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${accessToken}`,
          }),
        })
      );
    });
  });

  it("links a contact to a company and records relationship history", async () => {
    const linkedContact = { ...contact };
    const historyEntry = {
      id: "77777777-7777-4777-8777-777777777777",
      organizationId,
      companyId: company.id,
      contactId: contact.id,
      authorUserId: userId,
      kind: "NOTE",
      content: "Contato apresentou interesse na proposta.",
      occurredAt: "2026-09-07T10:20:00.000Z",
      createdAt: "2026-09-07T10:20:00.000Z",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [linkedContact], page: 1, limit: 20, total: 1 })
      )
      .mockResolvedValueOnce(
        response({ items: [company], page: 1, limit: 100, total: 1 })
      )
      .mockResolvedValueOnce(response({ id: "link-1" }, 201))
      .mockResolvedValueOnce(response(historyEntry, 201));
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactsView accessToken={accessToken} />);

    const contactCard = (await screen.findByText("Ana Silva")).closest(
      "article"
    );
    expect(contactCard).not.toBeNull();

    fireEvent.click(
      within(contactCard as HTMLElement).getByRole("button", {
        name: "Vincular empresa",
      })
    );
    const linkForm = screen.getByRole("form", { name: "Vincular empresa" });
    fireEvent.change(within(linkForm).getByLabelText("Empresa"), {
      target: { value: company.id },
    });
    fireEvent.click(
      within(linkForm).getByRole("button", { name: "Confirmar vínculo" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          `/companies/${company.id}/contacts/${contact.id}`
        ),
        expect.objectContaining({ method: "POST" })
      );
    });

    fireEvent.click(
      within(contactCard as HTMLElement).getByRole("button", {
        name: "Registrar histórico",
      })
    );
    const historyForm = screen.getByRole("form", {
      name: "Registrar histórico",
    });
    fireEvent.change(within(historyForm).getByLabelText("Tipo"), {
      target: { value: "NOTE" },
    });
    fireEvent.change(within(historyForm).getByLabelText("Registro"), {
      target: { value: "Contato apresentou interesse na proposta." },
    });
    fireEvent.click(
      within(historyForm).getByRole("button", { name: "Salvar histórico" })
    );

    expect(
      await screen.findByText("Contato apresentou interesse na proposta.")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("/relationship-entries"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
      })
    );
  });

  it("links an available tag to a contact", async () => {
    const tag = {
      id: "91000000-0000-4000-8000-000000000001",
      organizationId,
      name: "Cliente VIP",
      normalizedName: "cliente vip",
      createdAt: "2026-09-07T10:30:00.000Z",
      updatedAt: "2026-09-07T10:30:00.000Z",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [contact], page: 1, limit: 20, total: 1 })
      )
      .mockResolvedValueOnce(
        response({ items: [company], page: 1, limit: 100, total: 1 })
      )
      .mockResolvedValueOnce(
        response({ items: [tag], page: 1, limit: 100, total: 1 })
      )
      .mockResolvedValueOnce(
        response(
          {
            id: "92000000-0000-4000-8000-000000000001",
            organizationId,
            contactId: contact.id,
            tagId: tag.id,
          },
          201
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactsView accessToken={accessToken} />);

    const contactCard = (await screen.findByText("Ana Silva")).closest(
      "article"
    );
    expect(contactCard).not.toBeNull();

    fireEvent.click(
      within(contactCard as HTMLElement).getByRole("button", {
        name: "Gerenciar tags",
      })
    );

    const tagEditor = await screen.findByLabelText("Tags do contato Ana Silva");
    fireEvent.change(within(tagEditor).getByLabelText("Adicionar tag"), {
      target: { value: tag.id },
    });
    fireEvent.click(
      within(tagEditor).getByRole("button", { name: "Vincular tag" })
    );

    expect(
      await within(tagEditor).findByText("Cliente VIP")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/tags?page=1&limit=100"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining(`/contacts/${contact.id}/tags/${tag.id}`),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("renders accessible controls for every supported custom field type", () => {
    render(
      <CustomFieldsEditor
        definitions={[
          {
            id: "81000000-0000-4000-8000-000000000001",
            key: "summary",
            label: "Resumo",
            type: "TEXT",
            scope: "CONTACT",
            isRequired: false,
            isActive: true,
            options: null,
          },
          {
            id: "81000000-0000-4000-8000-000000000002",
            key: "score",
            label: "Pontuação",
            type: "NUMBER",
            scope: "CONTACT",
            isRequired: false,
            isActive: true,
            options: null,
          },
          {
            id: "81000000-0000-4000-8000-000000000003",
            key: "vip",
            label: "VIP",
            type: "BOOLEAN",
            scope: "CONTACT",
            isRequired: false,
            isActive: true,
            options: null,
          },
          {
            id: "81000000-0000-4000-8000-000000000004",
            key: "renewal",
            label: "Renovação",
            type: "DATE",
            scope: "CONTACT",
            isRequired: false,
            isActive: true,
            options: null,
          },
          {
            id: "81000000-0000-4000-8000-000000000005",
            key: "segment",
            label: "Segmento",
            type: "SELECT",
            scope: "CONTACT",
            isRequired: false,
            isActive: true,
            options: ["A", "B"],
          },
        ]}
        values={{}}
        onChange={() => undefined}
      />
    );

    expect(screen.getByLabelText("Resumo")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Pontuação")).toHaveAttribute(
      "type",
      "number"
    );
    expect(screen.getByLabelText("VIP")).toHaveAttribute("type", "checkbox");
    expect(screen.getByLabelText("Renovação")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Segmento")).toHaveRole("combobox");
  });
});
