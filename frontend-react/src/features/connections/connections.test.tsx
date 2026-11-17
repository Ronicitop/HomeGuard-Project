import { test, expect } from "vitest";
import { readingText, statusText } from "./models";
test("unreported sensor and actuator values never display a fabricated normal state", () => {
  expect(
    readingText({
      kind: "SENSOR",
      type: "TEMPERATURE",
      unit: "°C",
      last_value: null,
    }),
  ).toBe("Sin lecturas");
  expect(
    readingText({ kind: "SENSOR", type: "DOOR", unit: "", last_value: false }),
  ).toBe("Cerrada");
  expect(
    readingText({ kind: "SENSOR", type: "SMOKE", unit: "", last_value: true }),
  ).toBe("Detectado");
  expect(
    readingText({ kind: "SENSOR", type: "POWER", unit: "W", last_value: 0 }),
  ).toBe("0 W");
  expect(
    readingText({
      kind: "ACTUATOR",
      type: "RELAY",
      unit: "",
      last_value: null,
    }),
  ).toBe("Sin lecturas");
  expect(statusText.WAITING).toBe("Esperando datos");
});
