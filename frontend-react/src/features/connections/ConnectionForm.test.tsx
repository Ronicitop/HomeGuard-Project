import { test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionForm } from "./ConnectionForm";
import { api } from "../../shared/api";
import type { Catalog, Connection } from "./models";
vi.mock("../../shared/api", () => ({
  api: { post: vi.fn(), patch: vi.fn() },
  errorMessage: (e: Error) => e.message,
}));
const catalog: Catalog = {
  sensor_types: [
    { id: "TEMPERATURE", label: "Temperatura", unit: "°C", format: "number" },
    { id: "DOOR", label: "Puerta o contacto", unit: "", format: "boolean" },
  ],
  actuator_types: [
    { id: "RELAY", label: "Relé", unit: "", format: "state" },
    { id: "SIREN", label: "Sirena", unit: "", format: "state" },
  ],
};
test("a beginner chooses a sensor and saves without seeing technical inputs", async () => {
  const user = userEvent.setup(),
    saved = vi.fn();
  vi.mocked(api.post).mockResolvedValue({ connection: {}, credentials: null });
  render(
    <ConnectionForm
      existing={null}
      catalog={catalog}
      saved={saved}
      cancel={() => {}}
    />,
  );
  expect(
    screen.queryByLabelText("Nombre", { exact: true }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^Sensor$/ }));
  expect(screen.getByLabelText("Modo de conexión")).not.toBeVisible();
  expect(
    screen.getByLabelText("Frecuencia de contacto (segundos)"),
  ).not.toBeVisible();
  expect(screen.getByLabelText("Clave del canal")).not.toBeVisible();
  await user.type(
    screen.getByLabelText("Nombre", { exact: true }),
    "Puerta de entrada",
  );
  await user.selectOptions(
    screen.getByLabelText("¿Qué mide o detecta?"),
    "DOOR",
  );
  await user.click(screen.getByRole("button", { name: "Registrar equipo" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(api.post).toHaveBeenLastCalledWith(
    "/connections",
    expect.objectContaining({
      kind: "SENSOR",
      transport: "HTTP",
      heartbeat_seconds: 15,
      enabled: true,
      channels: [
        expect.objectContaining({
          key: "main",
          type: "DOOR",
          name: "Puerta o contacto",
        }),
      ],
    }),
  );
});
test("camera setup shows webcam controls instead of sensor or protocol fields", async () => {
  const user = userEvent.setup();
  render(
    <ConnectionForm
      existing={null}
      catalog={catalog}
      saved={() => {}}
      cancel={() => {}}
    />,
  );
  await user.click(screen.getByRole("button", { name: /^Cámara$/ }));
  expect(screen.getByRole("button", { name: "Buscar cámaras" })).toBeVisible();
  expect(screen.queryByLabelText("Modo de conexión")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Clave del canal")).not.toBeInTheDocument();
});
test("editing only the friendly name preserves installer settings", async () => {
  const user = userEvent.setup(),
    saved = vi.fn();
  const existing = {
    id: "existing",
    revision: 7,
    name: "Mi sensor",
    kind: "SENSOR",
    transport: "MQTT",
    location: "Entrada",
    model: "Modelo propio",
    enabled: false,
    heartbeat_seconds: 90,
    webcam_device_id: null,
    channels: [
      {
        key: "door_front",
        name: "Contacto principal",
        kind: "SENSOR",
        type: "DOOR",
        unit: "",
      },
    ],
  } as Connection;
  vi.mocked(api.patch).mockResolvedValue(existing);
  render(
    <ConnectionForm
      existing={existing}
      catalog={catalog}
      saved={saved}
      cancel={() => {}}
    />,
  );
  await user.clear(screen.getByLabelText("Nombre", { exact: true }));
  await user.type(
    screen.getByLabelText("Nombre", { exact: true }),
    "Entrada principal",
  );
  await user.click(
    screen.getByRole("button", { name: "Guardar configuración" }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(api.patch).toHaveBeenLastCalledWith(
    "/connections/existing",
    expect.objectContaining({
      transport: "MQTT",
      heartbeat_seconds: 90,
      enabled: false,
      model: "Modelo propio",
      expected_revision: 7,
      channels: [
        expect.objectContaining({
          key: "door_front",
          name: "Contacto principal",
        }),
      ],
    }),
  );
});
