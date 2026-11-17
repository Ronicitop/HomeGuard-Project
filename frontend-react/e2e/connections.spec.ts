import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
  await expect(
    dialog.getByRole("heading", { name: "¿Qué querés conectar?" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Sensor", exact: true }).click();
  await dialog.getByLabel("Nombre", { exact: true }).fill(name);
  await dialog.getByLabel("Ubicación", { exact: true }).fill("Laboratorio");
  await dialog.getByLabel("¿Qué mide o detecta?").selectOption("DOOR");
  await expect(dialog.getByLabel("Modo de conexión")).not.toBeVisible();
  await expect(
    dialog.getByLabel("Frecuencia de contacto (segundos)"),
  ).not.toBeVisible();
  await expect(dialog.getByLabel("Clave del canal")).not.toBeVisible();
  await dialog.screenshot({
    path: "../.local/verification/connections-simple-form-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog.screenshot({
    path: "../.local/verification/connections-simple-form-mobile.png",
  });
  let release!: () => void;
  let allowSave = false;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/v1/connections", async (route) => {
    if (route.request().method() === "POST") {
      await gate;
      if (allowSave) await route.continue();
      else await route.abort();
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Registrar equipo" }).click();
  try {
    await expect(
      dialog.getByRole("button", { name: "Cancelar", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Cerrar diálogo", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    allowSave = true;
  } finally {
    release();
  }
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("se muestra una sola vez");
  await expect(dialog.getByLabel("Token del dispositivo")).not.toBeVisible();
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Descargar configuración" }).click();
  const download = await downloading;
  const file = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(file.http.base_url).toContain("/api/v1/device-ingest/");
  expect(file.channels[0]).toMatchObject({ key: "main", type: "DOOR" });
  const token = file.http.bearer_token;
  expect(token).toMatch(/^hgd_/);
  await dialog.getByRole("button", { name: "Listo", exact: true }).click();
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
  card = page.locator(".panel").filter({
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
