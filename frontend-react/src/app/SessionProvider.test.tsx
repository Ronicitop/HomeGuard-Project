import { test, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionProvider, useSession } from "./SessionProvider";
function Probe() {
  const { user, loading, signIn } = useSession();
  return (
    <div>
      {loading ? "Cargando" : user ? user.nombre : "Sin sesión"}
      <button onClick={() => void signIn("admin@test.local", "secret")}>
        Ingresar
      </button>
    </div>
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
test("does not trust a forged user stored by the legacy frontend", async () => {
  localStorage.setItem(
    "homeguard_user",
    JSON.stringify({ id: 1, rol: "ADMINISTRADOR" }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: { code: "SESSION_REQUIRED", message: "Iniciá sesión" } },
        { status: 401 },
      ),
    ),
  );
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  expect(await screen.findByText("Sin sesión")).toBeInTheDocument();
});
test("restores the server session and clears sensitive state on expiry", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        id: 2,
        nombre: "Invitado",
        rol: "INVITADO",
        csrf_token: "csrf",
      }),
    ),
  );
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  expect(await screen.findByText("Invitado")).toBeInTheDocument();
  window.dispatchEvent(new Event("hg:session-expired"));
  expect(await screen.findByText("Sin sesión")).toBeInTheDocument();
});
test("a successful login uses the issued server identity", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      String(input).endsWith("/auth/login")
        ? Response.json({
            user: { id: 1, nombre: "Admin", rol: "ADMINISTRADOR" },
            csrf_token: "new-csrf",
          })
        : Response.json(
            { error: { code: "SESSION_REQUIRED" } },
            { status: 401 },
          ),
    ),
  );
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("Sin sesión");
  await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
  await waitFor(() => expect(screen.getByText("Admin")).toBeInTheDocument());
});
