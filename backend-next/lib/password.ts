import { createHash } from "node:crypto";
export { hashPassword, verifyPassword } from "./auth/passwordService";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
