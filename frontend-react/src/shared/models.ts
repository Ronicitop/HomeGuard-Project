export type {
  EventView,
  UserView,
  Page,
  IncidentView,
  EventStatus,
} from "../../../contracts/types";
export interface ModeView {
  mode: "HOME" | "AWAY" | "DISARMED";
  revision: number;
}
export interface Dashboard {
  counts: { total: number; new: number; security: number; emergency: number };
  mode: ModeView;
  active_incidents: import("../../../contracts/types").IncidentView[];
  timezone: string;
  demo_mode: boolean;
}
export interface Actuator {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  estado_actual: string;
  last_command: {
    id: string;
    status: string;
    requested_state: string;
    confirmed_state: string | null;
    confirmation_source: string | null;
  } | null;
}
export interface Health {
  database: string;
  demo_mode: boolean;
  services: { name: string; status: string; last_seen: string }[];
  integrations: {
    vision: boolean;
    push: boolean;
    voice: boolean;
    codex: string;
  };
  pending_jobs: number;
}
export interface EmergencyPolicy {
  enabled: boolean;
  immobility_seconds: number;
  response_seconds: number;
  transport: "SIMULATED";
  revision: number;
}
export interface EmergencyProfile {
  contact_name: string;
  address: string;
  access_notes: string;
  contacts: { name: string; phone: string }[];
  fictitious_data_confirmed: boolean;
  revision: number;
}
export interface Member {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  role: "ADMINISTRADOR" | "RESIDENTE" | "INVITADO";
  enabled: boolean;
  revision: number;
}
export interface Preferences {
  categories: string[];
  quiet_start: string | null;
  quiet_end: string | null;
  critical_demo_override: boolean;
  revision: number;
}
export interface LegacyStatus {
  modo: string;
  dispositivos: {
    id: string;
    tipo_sensor: string;
    valor_numerico: number | null;
    estado_texto: string;
    unidad: string;
    fecha_registro: string;
  }[];
  alertasRecientes: { id: number; titulo: string; severidad: string }[];
  energia: {
    voltaje_v: number;
    potencia_w: number;
    energia_kwh: number;
  } | null;
  plano2D: {
    id: number;
    pos_x: number;
    pos_y: number;
    etiqueta: string;
    zona_habitacion: string;
  }[];
}
