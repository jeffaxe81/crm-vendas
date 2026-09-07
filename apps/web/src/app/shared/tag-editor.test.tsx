import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagEditor } from "./tag-editor";

const availableTags = [
  {
    id: "91000000-0000-4000-8000-000000000001",
    name: "Cliente VIP",
  },
  {
    id: "91000000-0000-4000-8000-000000000002",
    name: "Renovação 2027",
  },
];

describe("TagEditor", () => {
  it("links an available tag and removes an already linked tag", () => {
    const onLink = vi.fn();
    const onUnlink = vi.fn();

    render(
      <TagEditor
        availableTags={availableTags}
        linkedTagIds={[availableTags[0].id]}
        onLink={onLink}
        onUnlink={onUnlink}
      />
    );

    expect(screen.getByText("Cliente VIP")).toBeInTheDocument();
    expect(screen.getByText("Renovação 2027")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remover tag Cliente VIP" })
    );
    expect(onUnlink).toHaveBeenCalledWith(availableTags[0].id);

    fireEvent.change(screen.getByLabelText("Adicionar tag"), {
      target: { value: availableTags[1].id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular tag" }));

    expect(onLink).toHaveBeenCalledWith(availableTags[1].id);
  });
});
