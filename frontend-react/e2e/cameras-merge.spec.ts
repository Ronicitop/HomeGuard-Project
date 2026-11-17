import { test, expect } from "@playwright/test";
test("camera branch uses the existing login and can register and remove a webcam without exposing profiles", async ({
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
  await expect(page.getByRole("heading", { name: /Tu hogar,/ })).toBeVisible();
  await page.getByRole("link", { name: "Cámaras", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cámaras", exact: true }),
  ).toBeVisible();
  const name = `Webcam integración ${Date.now()}`;
  await page.locator(".camera-side form input").fill(name);
  await page.getByRole("button", { name: "Crear cámara", exact: true }).click();
  await expect(
    page.locator(".camera-toolbar select option").filter({ hasText: name }),
  ).toHaveCount(1);
  const metadata = await (await page.request.get("/api/vision")).json();
  expect(
    metadata.profiles.every(
      (p: Record<string, unknown>) => !("descriptores" in p),
    ),
  ).toBe(true);
  await page.locator(".camera-toolbar select").selectOption({ label: name });
  await page
    .getByRole("button", { name: "Eliminar cámara seleccionada" })
    .click();
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(
    page.locator(".camera-toolbar select option").filter({ hasText: name }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "../.local/verification/cameras-merge-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
