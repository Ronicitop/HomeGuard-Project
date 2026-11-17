import { test, expect } from "@playwright/test";
test("connections registration, revision, enable and removal never invent sensor readings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill("admin@homeguard.local");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(process.env.HG_E2E_PASSWORD || "HomeGuard2026!");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("link", { name: "Conexiones", exact: true }).click();
  const name = `Sensor sin hardware ${Date.now()}`;
  await page.getByRole("button", { name: "Agregar equipo" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre", { exact: true }).fill(name);
  await dialog.getByLabel("Ubicación", { exact: true }).fill("Laboratorio");
  await dialog.getByRole("button", { name: "Registrar equipo" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("se muestra una sola vez");
  const token = await dialog.getByLabel("Token del dispositivo").inputValue();
  expect(token).toMatch(/^hgd_/);
  await dialog.getByRole("button", { name: "Ya guardé la credencial" }).click();
  let card = page
    .locator(".panel")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toContainText("Esperando datos");
  await expect(card).toContainText("Sin lecturas");
  const response = await page.request.get("/api/v1/connections");
  const listed = await response.json();
  expect(JSON.stringify(listed)).not.toContain(token);
  expect(JSON.stringify(listed)).not.toContain("credential_hash");
  const device = listed.items.find((c: { name: string }) => c.name === name);
  expect(device.last_seen).toBeNull();
  await card.getByRole("button", { name: "Configurar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Nombre", { exact: true })
    .fill(name + " editado");
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  card = page
    .locator(".panel")
    .filter({
      has: page.getByRole("heading", { name: name + " editado", exact: true }),
    });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Deshabilitar", exact: true }).click();
  await expect(card).toContainText("Deshabilitado");
  await card.getByRole("button", { name: "Habilitar", exact: true }).click();
  await expect(card).toContainText("Esperando datos");
  await expect(page.locator(".skip-link")).not.toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../.local/verification/connections-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const box = await page.locator(".sidebar").boundingBox();
      return box ? box.x + box.width : 1;
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "../.local/verification/connections-mobile.png",
    fullPage: true,
  });
  await card.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(card).toHaveCount(0);
  await page.goto("/security");
  await expect(
    page.getByText("Sin sensores reales vinculados.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Lecturas del sistema IoT existente."),
  ).toHaveCount(0);
  await expect(page.getByText("24 °C", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
