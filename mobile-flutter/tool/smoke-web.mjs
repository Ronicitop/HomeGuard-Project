import { fileURLToPath } from "node:url";
import {
  chromium,
  expect,
} from "../../frontend-react/node_modules/@playwright/test/index.mjs";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(process.env.HG_FLUTTER_ORIGIN || "http://127.0.0.1:5174");
  await page.locator("flt-semantics-placeholder").waitFor({ timeout: 30000 });
  await page.locator("flt-semantics-placeholder").evaluate((el) => el.click());
  await page
    .getByRole("textbox", { name: "Correo electrónico", exact: true })
    .fill("admin@homeguard.local");
  await page
    .getByRole("textbox", { name: "Contraseña", exact: true })
    .fill(process.env.HG_E2E_PASSWORD || "HomeGuard2026!");
  await page
    .getByRole("button", { name: "Entrar a mi hogar", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: "Más", exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  async function textContains(text) {
    await expect
      .poll(() => page.locator("body").ariaSnapshot(), { timeout: 12000 })
      .toContain(text);
  }
  async function capture(name) {
    await page.screenshot({
      path: fileURLToPath(
        new URL(
          `../../.local/verification/flutter-${name}.png`,
          import.meta.url,
        ),
      ),
    });
  }
  await textContains("Tu hogar,");
  await capture("dashboard");
  for (const [tab, content] of [
    ["Cámaras", "Mirar cámaras ya conectadas"],
    ["Eventos", "Historial y evidencia"],
    ["Seguridad", "Modo de protección"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await textContains(content);
    await capture(
      tab === "Cámaras" ? "cameras" : tab === "Eventos" ? "events" : "security",
    );
  }
  await page.getByRole("tab", { name: "Más", exact: true }).click();
  for (const [name, content, file] of [
    ["Conexiones", "Datos y configuración", "connections"],
    ["Personas", "Perfiles faciales y encuentros", "people"],
    ["Movimientos", "Configuración de movimientos pendiente", "movements"],
    ["Emergencias", "Cuidado y respuesta", "emergencies"],
    ["Configuración", "Tu cuenta, los avisos", "settings"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await textContains(content);
    await expect(
      page.getByRole("button", { name: "Agregar equipo", exact: true }),
    ).toHaveCount(0);
    await capture(file);
    await page.getByRole("button", { name: "Back", exact: true }).click();
  }
  expect(errors).toEqual([]);
  console.log(
    "Flutter: acceso y ocho módulos verificados en pantalla móvil; sin errores ni altas de hardware.",
  );
} finally {
  await browser.close();
}
