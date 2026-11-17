// Compatibility for camera-branch consumers: B remains the sole session authority.
import { headers } from "next/headers";
import { requireSession, currentUser as userView } from "./auth/sessionService";
export { hashPassword, verifyPassword } from "./auth/passwordService";
export { digest } from "./password";
export async function currentUser(request?: Request) {
  try {
    const ctx = await requireSession(
      request ||
        new Request("http://localhost/api/vision", {
          headers: await headers(),
        }),
    );
    const user = await userView(ctx);
    return {
      ...user,
      rol: ctx.role === "ADMINISTRADOR" ? "ADMIN" : ctx.role,
      auth_context: ctx,
    };
  } catch {
    return null;
  }
}
