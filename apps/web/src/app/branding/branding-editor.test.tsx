import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { defaultBranding } from "@axes/contracts";
import { BrandingEditor } from "./branding-editor";
afterEach(cleanup);
it("previews color edits without saving and submits the selected profile", async () => {
  const save = vi.fn(async value => value);
  render(
    <BrandingEditor branding={defaultBranding} save={save} loading={false} />
  );
  fireEvent.change(screen.getByLabelText("Cor principal"), {
    target: { value: "#aa2244" },
  });
  expect(
    screen
      .getByLabelText("Prévia da identidade visual")
      .style.getPropertyValue("--crm-primary")
  ).toBe("#aa2244");
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Salvar identidade visual" })
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "salva para esta empresa"
  );
  expect(save).toHaveBeenCalledWith({
    ...defaultBranding,
    primaryColor: "#aa2244",
  });
});
it("uploads a raster logo, permits removal and restores defaults only on save", async () => {
  const save = vi.fn(async value => value);
  render(
    <BrandingEditor
      branding={{ ...defaultBranding, menuColor: "#123456" }}
      save={save}
      loading={false}
    />
  );
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
    ),
    c => c.charCodeAt(0)
  );
  fireEvent.change(screen.getByLabelText(/Logo \(PNG/), {
    target: { files: [new File([bytes], "logo.png", { type: "image/png" })] },
  });
  expect(
    await screen.findByAltText("Logo da empresa na prévia")
  ).toHaveAttribute("src", expect.stringContaining("data:image/png;base64,"));
  fireEvent.click(screen.getByRole("button", { name: "Remover logo" }));
  expect(screen.queryByAltText("Logo da empresa na prévia")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Restaurar identidade padrão" })
  );
  expect(save).toHaveBeenCalledWith({
    ...defaultBranding,
    menuColor: "#123456",
    logo: expect.stringContaining("data:image/png;base64,"),
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Salvar identidade visual" })
  );
  await waitFor(() => expect(save).toHaveBeenCalledWith(defaultBranding));
});
it("rejects SVG and large uploads and retains errors from the server", async () => {
  render(
    <BrandingEditor
      branding={defaultBranding}
      save={async () => {
        throw Error("Sem permissão");
      }}
      loading={false}
    />
  );
  fireEvent.change(screen.getByLabelText(/Logo \(PNG/), {
    target: {
      files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })],
    },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("PNG ou JPEG");
  fireEvent.click(
    screen.getByRole("button", { name: "Salvar identidade visual" })
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão");
});
