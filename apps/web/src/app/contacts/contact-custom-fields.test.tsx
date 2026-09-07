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

const accessToken = "cycle-2-access-token";
const organizationId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";

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

describe("Cycle 2 contact custom fields persistence", () => {
  it("loads an existing value and persists an edited contact custom field", async () => {
    const definition = {
      id: "81000000-0000-4000-8000-000000000005",
      organizationId,
      scope: "CONTACT",
      key: "segment",
      label: "Segmento",
      type: "SELECT",
      isRequired: false,
      options: ["A", "B"],
      isActive: true,
      createdAt: "2026-09-07T10:40:00.000Z",
      updatedAt: "2026-09-07T10:40:00.000Z",
    };
    const storedValue = {
      id: "82000000-0000-4000-8000-000000000001",
      organizationId,
      contactId: contact.id,
      definitionId: definition.id,
      value: "A",
      createdAt: "2026-09-07T10:41:00.000Z",
      updatedAt: "2026-09-07T10:41:00.000Z",
      definition,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [contact], page: 1, limit: 20, total: 1 })
      )
      .mockResolvedValueOnce(
        response({ items: [], page: 1, limit: 100, total: 0 })
      )
      .mockResolvedValueOnce(response([definition]))
      .mockResolvedValueOnce(response([storedValue]))
      .mockResolvedValueOnce(response({ ...storedValue, value: "B" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactsView accessToken={accessToken} />);

    const contactCard = (await screen.findByText("Ana Silva")).closest(
      "article"
    );
    expect(contactCard).not.toBeNull();

    fireEvent.click(
      within(contactCard as HTMLElement).getByRole("button", {
        name: "Campos customizados",
      })
    );

    const editor = await screen.findByLabelText(
      "Campos customizados do contato Ana Silva"
    );
    expect(within(editor).getByLabelText("Segmento")).toHaveValue("A");

    fireEvent.change(within(editor).getByLabelText("Segmento"), {
      target: { value: "B" },
    });
    fireEvent.click(
      within(editor).getByRole("button", {
        name: "Salvar campos customizados",
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("/custom-fields?scope=CONTACT"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${accessToken}`,
          }),
        })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(`/contacts/${contact.id}/custom-fields`),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${accessToken}`,
          }),
        })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        expect.stringContaining(
          `/contacts/${contact.id}/custom-fields/${definition.id}`
        ),
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ value: "B" }),
        })
      );
    });
  });
});
