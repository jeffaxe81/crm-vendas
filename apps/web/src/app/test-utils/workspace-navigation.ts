import { fireEvent, screen } from "@testing-library/react";
export async function openNavigationGroup(group: string) {
  const button = await screen.findByRole("button", { name: `Grupo ${group}` });
  if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
}
