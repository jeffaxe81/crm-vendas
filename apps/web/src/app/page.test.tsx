import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the Cycle 1 login form", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "CRM Axesistemas" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar no CRM" })
    ).toBeInTheDocument();
  });
});
