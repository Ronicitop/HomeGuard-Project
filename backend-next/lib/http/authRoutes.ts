import { z } from "zod";
import { body, json } from "./response";
import {
  assertOrigin,
  login,
  currentUser,
  requireSession,
  revokeSession,
} from "../auth/sessionService";
export async function authRoute(
  request: Request,
  path: string,
): Promise<Response | null> {
  if (path === "auth/login" && request.method === "POST") {
    assertOrigin(request);
    const input = await body(
      request,
      z
        .object({
          email: z.string().email().max(150),
          password: z.string().min(1).max(1024),
          platform: z.enum(["web", "mobile"]).default("web"),
        })
        .strict(),
    );
    const issued = await login(input.email, input.password, "local-client");
    if (input.platform === "mobile") return json(issued);
    const cookie = `hg_session=${issued.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
    return json(
      {
        user: issued.user,
        csrf_token: issued.csrf_token,
        expires_at: issued.expires_at,
      },
      200,
      { "Set-Cookie": cookie },
    );
  }
  if (path === "auth/me" && request.method === "GET")
    return json(await currentUser(await requireSession(request)));
  if (path === "auth/logout" && request.method === "POST") {
    await revokeSession(await requireSession(request));
    return json({ success: true }, 200, {
      "Set-Cookie": "hg_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    });
  }
  return null;
}
