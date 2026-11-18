import { test, expect } from "@playwright/test";

test.use({ channel: process.env.HG_BROWSER_CHANNEL });

for (const viewport of [
  { width: 1366, height: 650 },
  { width: 390, height: 667 },
  { width: 740, height: 360 },
]) {
  test(`Salir queda al alcance en ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let authenticated = true;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/me")) {
        return route.fulfill(
          authenticated
            ? {
                json: {
                  id: 1,
                  rol: "ADMINISTRADOR",
                  nombre: "Prueba",
                  csrf_token: "test-csrf",
                },
              }
            : { status: 401, json: { error: { code: "SESSION_REQUIRED" } } },
        );
      }
      if (path.endsWith("/auth/logout")) {
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
        authenticated = false;
      }
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto("/people");
    if (viewport.width <= 850)
      await page.getByRole("button", { name: "Abrir menú" }).click();
    const exit = page.getByRole("button", { name: "Salir", exact: true });
    await expect(exit).toBeInViewport({ ratio: 1 });
    await exit.click();
    await expect(
      page.getByRole("button", { name: "Entrar al panel" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Entrar al panel" }),
    ).toBeVisible();
  });
}
