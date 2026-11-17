import { z } from "zod";
import { fail } from "../http/errors";
export const sensorTypes = [
  {
    id: "TEMPERATURE",
    label: "Temperatura",
    unit: "°C",
    format: "number",
    min: -100,
    max: 150,
  },
  {
    id: "HUMIDITY",
    label: "Humedad",
    unit: "%",
    format: "number",
    min: 0,
    max: 100,
  },
  { id: "DOOR", label: "Puerta o contacto", unit: "", format: "boolean" },
  { id: "MOTION", label: "Movimiento", unit: "", format: "boolean" },
  { id: "SMOKE", label: "Alarma de humo", unit: "", format: "boolean" },
  { id: "WATER", label: "Agua o inundación", unit: "", format: "boolean" },
  { id: "GAS", label: "Alarma de gas", unit: "", format: "boolean" },
  {
    id: "DIGITAL",
    label: "Entrada digital / botón",
    unit: "",
    format: "boolean",
  },
  {
    id: "CO2",
    label: "CO₂ informado",
    unit: "ppm",
    format: "number",
    min: 0,
    max: 100000,
  },
  {
    id: "LIGHT",
    label: "Iluminación",
    unit: "lux",
    format: "number",
    min: 0,
    max: 200000,
  },
  {
    id: "SOUND",
    label: "Nivel sonoro",
    unit: "dB",
    format: "number",
    min: 0,
    max: 200,
  },
  {
    id: "POWER",
    label: "Potencia eléctrica",
    unit: "W",
    format: "number",
    min: 0,
    max: 100000,
  },
  {
    id: "VOLTAGE",
    label: "Voltaje",
    unit: "V",
    format: "number",
    min: 0,
    max: 1000,
  },
  {
    id: "CURRENT",
    label: "Corriente",
    unit: "A",
    format: "number",
    min: 0,
    max: 1000,
  },
  {
    id: "ENERGY",
    label: "Energía acumulada",
    unit: "kWh",
    format: "number",
    min: 0,
    max: 1e9,
  },
  {
    id: "BATTERY",
    label: "Batería",
    unit: "%",
    format: "number",
    min: 0,
    max: 100,
  },
  {
    id: "NUMBER",
    label: "Medición numérica personalizada",
    unit: "",
    format: "number",
    min: -1e12,
    max: 1e12,
  },
];
export const actuatorTypes = [
  "RELAY",
  "SIREN",
  "VALVE",
  "LIGHT",
  "SWITCH",
  "OUTPUT",
].map((id) => ({
  id,
  label: (
    {
      RELAY: "Relé",
      SIREN: "Sirena",
      VALVE: "Válvula",
      LIGHT: "Luz",
      SWITCH: "Interruptor",
      OUTPUT: "Salida digital",
    } as Record<string, string>
  )[id],
  format: "state",
  unit: "",
}));
export const channelSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["SENSOR", "ACTUATOR"]),
    type: z.string().max(40),
    unit: z.string().max(16).default(""),
  })
  .strict();
export const connectionSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    kind: z.enum(["CAMERA", "SENSOR", "ACTUATOR", "GATEWAY"]),
    transport: z.enum(["WEBCAM", "MQTT", "HTTP"]),
    location: z.string().trim().max(100).default(""),
    model: z.string().trim().max(100).default(""),
    heartbeat_seconds: z.number().int().min(5).max(3600).default(15),
    enabled: z.boolean().default(true),
    webcam_device_id: z.string().max(1024).nullable().default(null),
    channels: z.array(channelSchema).max(16).default([]),
  })
  .strict();
export type ConnectionInput = z.infer<typeof connectionSchema>;
export function parseDefinition(raw: unknown): ConnectionInput {
  const result = connectionSchema.safeParse(raw);
  if (!result.success)
    fail(
      400,
      "INVALID_CONNECTION",
      "Revisá el nombre, protocolo y canales del equipo.",
    );
  const d = result.data;
  if ((d.kind === "CAMERA") !== (d.transport === "WEBCAM"))
    fail(
      400,
      "INVALID_TRANSPORT",
      "Cámaras usa webcam/navegador; los demás equipos usan MQTT o HTTP.",
    );
  if (
    (d.kind === "CAMERA" && d.channels.length) ||
    (d.kind !== "CAMERA" && !d.channels.length)
  )
    fail(
      400,
      "INVALID_CHANNELS",
      "Configurá los canales que tendrá el equipo.",
    );
  if (
    ["SENSOR", "ACTUATOR"].includes(d.kind) &&
    (d.channels.length !== 1 || d.channels[0].kind !== d.kind)
  )
    fail(
      400,
      "INVALID_CHANNELS",
      "Este equipo debe tener un canal de su mismo tipo.",
    );
  if (new Set(d.channels.map((c) => c.key)).size !== d.channels.length)
    fail(
      400,
      "DUPLICATE_CHANNEL",
      "Los identificadores de canales deben ser únicos.",
    );
  for (const c of d.channels) {
    const type = (c.kind === "SENSOR" ? sensorTypes : actuatorTypes).find(
      (t) => t.id === c.type,
    );
    if (!type)
      fail(
        400,
        "UNSUPPORTED_CHANNEL",
        "Elegí un tipo de sensor o actuador soportado.",
      );
    c.unit = c.unit || type.unit;
  }
  return d;
}
export function normalizeReading(
  channel: { kind: string; type: string },
  value: unknown,
) {
  if (channel.kind === "ACTUATOR") {
    if (value !== "ON" && value !== "OFF")
      fail(422, "INVALID_READING", "La salida debe informar ON u OFF.");
    return value;
  }
  const type = sensorTypes.find((t) => t.id === channel.type);
  if (!type) fail(422, "INVALID_READING", "Tipo de sensor desconocido.");
  if (type.format === "boolean") {
    if (typeof value !== "boolean")
      fail(422, "INVALID_READING", "Este sensor debe informar true o false.");
    return value;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < type.min! ||
    value > type.max!
  )
    fail(
      422,
      "INVALID_READING",
      "La medición no corresponde al tipo o rango del sensor.",
    );
  return value;
}
