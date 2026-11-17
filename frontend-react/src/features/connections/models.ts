export type ChannelDefinition = {
  key: string;
  name: string;
  kind: "SENSOR" | "ACTUATOR";
  type: string;
  unit: string;
};
export type Channel = ChannelDefinition & {
  id: string;
  last_value: string | number | boolean | null;
  last_observed_at: string | null;
  last_received_at: string | null;
  last_command: {
    id: string;
    status: string;
    requested_state: string;
    reported_state: string | null;
    error_code: string | null;
  } | null;
};
export type Definition = {
  name: string;
  kind: "CAMERA" | "SENSOR" | "ACTUATOR" | "GATEWAY";
  transport: "WEBCAM" | "HTTP" | "MQTT";
  location: string;
  model: string;
  enabled: boolean;
  heartbeat_seconds: number;
  webcam_device_id: string | null;
  channels: ChannelDefinition[];
};
export type Connection = Omit<Definition, "channels"> & {
  id: string;
  camera_id: number | null;
  revision: number;
  credential_generation: number;
  credential_ready: boolean;
  status: string;
  can_command: boolean;
  last_seen: string | null;
  last_sample_at: string | null;
  channels: Channel[];
};
export type Catalog = {
  sensor_types: { id: string; label: string; unit: string; format: string }[];
  actuator_types: { id: string; label: string; unit: string; format: string }[];
};
export type Credentials = {
  token: string;
  username: string;
  generation: number;
  topics: { telemetry: string; commands: string; ack: string };
  http_path: string;
};
export type Provision = {
  connection: Connection;
  credentials: Credentials | null;
};
export const statusText: Record<string, string> = {
  WAITING: "Esperando datos",
  ONLINE: "En línea",
  OFFLINE: "Sin conexión",
  DISABLED: "Deshabilitado",
};
export const kindText: Record<string, string> = {
  CAMERA: "Cámara",
  SENSOR: "Sensor",
  ACTUATOR: "Actuador",
  GATEWAY: "Controlador con varios canales",
};
export const commandText: Record<string, string> = {
  QUEUED: "Pendiente de envío",
  SENT: "Enviado; esperando respuesta",
  ACKNOWLEDGED: "Confirmado por el equipo",
  FAILED: "Rechazado / falló",
  EXPIRED: "Venció sin confirmación",
  CANCELLED: "Cancelado",
  UNKNOWN: "Sin confirmación",
};
export function readingText(
  c: Pick<Channel, "last_value" | "kind" | "type" | "unit">,
) {
  if (c.last_value === null || c.last_value === undefined)
    return "Sin lecturas";
  if (typeof c.last_value === "boolean")
    return c.type === "DOOR"
      ? c.last_value
        ? "Abierta"
        : "Cerrada"
      : c.last_value
        ? "Detectado"
        : "Sin detección";
  if (c.kind === "ACTUATOR")
    return c.last_value === "ON" ? "Encendido informado" : "Apagado informado";
  return `${c.last_value}${c.unit ? " " + c.unit : ""}`;
}
export function definitionOf(c: Definition): Definition {
  return {
    name: c.name,
    kind: c.kind,
    transport: c.transport,
    location: c.location,
    model: c.model,
    enabled: c.enabled,
    heartbeat_seconds: c.heartbeat_seconds,
    webcam_device_id: c.webcam_device_id,
    channels: c.channels.map(({ key, name, kind, type, unit }) => ({
      key,
      name,
      kind,
      type,
      unit,
    })),
  };
}
