import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, fail } from "./errors";
import { config } from "../config";
export const uuid = z.string().uuid();
export const revision = z.number().int().min(0);
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          fail(
            413,
            "BODY_TOO_LARGE",
            "La solicitud supera el límite permitido.",
          );
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    fail(400, "INVALID_JSON", "El cuerpo de la solicitud no es JSON válido.");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    fail(
      400,
      "INVALID_INPUT",
      "Revisá los campos enviados.",
      parsed.error.issues.map((x) => ({
        path: x.path.join("."),
        message: x.message,
      })),
    );
  return parsed.data;
}
export function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}
export function cors(response: Response, request: Request) {
  const origin = request.headers.get("origin");
  if (origin && config.origins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-CSRF-Token,Idempotency-Key,Last-Event-ID",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export function errorResponse(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof AppError)
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          request_id: requestId,
        },
      },
      error.status,
    );
  const pgCode = (error as any)?.code;
  if (pgCode === "23505")
    return json(
      {
        error: {
          code: "CONFLICT",
          message: "Ya existe un registro con esos datos.",
          request_id: requestId,
        },
      },
      409,
    );
  console.error(
    JSON.stringify({
      request_id: requestId,
      error_type: (error as any)?.name,
      code: pgCode || "INTERNAL",
    }),
  );
  return json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message:
          "No se pudo completar la operación. Revisá el estado del servicio.",
        request_id: requestId,
      },
    },
    500,
  );
}
