export type Role = "ADMINISTRADOR" | "RESIDENTE" | "INVITADO";
export type AuthContext = {
  user_id: number;
  household_id: string;
  role: Role;
  session_id: string;
};
import { fail } from "../http/errors";
const resident = new Set([
  "dashboard.read",
  "events.read",
  "events.update",
  "cameras.read",
  "people.read",
  "people.update",
  "rules.read",
  "clips.read",
  "notifications.manage",
  "mode.read",
  "mode.update",
  "actuators.read",
  "actuators.command",
  "emergencies.read",
  "emergencies.respond",
  "health.read",
]);
export function assertPermission(ctx: AuthContext, permission: string): void {
  if (
    ctx.role === "ADMINISTRADOR" ||
    (ctx.role === "RESIDENTE" && resident.has(permission)) ||
    (ctx.role === "INVITADO" && permission === "dashboard.read")
  )
    return;
  fail(
    403,
    "PERMISSION_DENIED",
    "Tu cuenta no tiene permiso para esta acción.",
  );
}
export function authorizeResource(ctx: AuthContext, householdId: string): void {
  if (ctx.household_id !== householdId)
    fail(404, "NOT_FOUND", "No se encontró el recurso.");
}
