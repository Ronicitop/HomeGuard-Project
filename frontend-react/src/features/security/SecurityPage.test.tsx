import { test, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../../shared/api";
import { SecurityPage } from "./SecurityPage";
vi.mock("../../shared/api", () => ({
  api: { get: vi.fn() },
  errorMessage: (e: Error) => e.message,
  refreshData: vi.fn(),
}));
test("actuator controls do not retain an online claim when connection refresh fails", async () => {
  let offline = false;
  vi.mocked(api.get).mockImplementation(async (path) => {
    if (path === "/mode") return { mode: "HOME", revision: 1 };
    if (path === "/actuators") return { items: [] };
    if (offline) throw new Error("Servidor sin conexión");
    return {
      items: [
        {
          id: "device",
          name: "Relé físico",
          location: "Cocina",
          status: "ONLINE",
          can_command: true,
          channels: [
            {
              key: "main",
              name: "Salida",
              kind: "ACTUATOR",
              type: "RELAY",
              last_value: "OFF",
              last_command: null,
            },
          ],
        },
      ],
    };
  });
  render(
    <MemoryRouter>
      <SecurityPage />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Solicitar encendido" }),
    ).toBeEnabled(),
  );
  offline = true;
  act(() => window.dispatchEvent(new Event("hg:refresh")));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Solicitar encendido" }),
    ).not.toBeInTheDocument(),
  );
});
