import { useState } from "react";
import {
  Shield,
  House,
  ShieldOff,
  Power,
  Radio,
  PlugZap,
  Droplets,
  Volume2,
  Activity,
} from "lucide-react";
import { useResource } from "../../shared/useResource";
import type {
  ModeView,
  Actuator,
  Page,
  LegacyStatus,
} from "../../shared/models";
import { api, errorMessage, refreshData } from "../../shared/api";
import {
  PageTitle,
  Panel,
  Badge,
  Notice,
  ResourceError,
  Loading,
} from "../../shared/ui";
export function SecurityPage() {
  const mode = useResource<ModeView>("/mode", 10000),
    actuators = useResource<Page<Actuator>>("/actuators", 5000),
    legacy = useResource<LegacyStatus>("/legacy/status", 10000);
  const [busy, setBusy] = useState(""),
    [message, setMessage] = useState("");
  async function changeMode(value: string) {
    if (!mode.data) return;
    setBusy("mode");
    setMessage("");
    try {
      await api.patch("/mode", {
        mode: value,
        expected_revision: mode.data.revision,
      });
      refreshData();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  async function command(a: Actuator) {
    setBusy(a.codigo);
    setMessage("");
    try {
      await api.post(`/actuators/${a.codigo}/commands`, {
        state: a.estado_actual === "ON" ? "OFF" : "ON",
      });
      setMessage(
        "Comando solicitado al simulador. El estado se actualizará al recibir confirmación.",
      );
      refreshData();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const currentMode = mode.data?.mode;
  return (
    <>
      <PageTitle
        eyebrow="PROTECCIÓN Y CONTROL"
        title="Seguridad del hogar"
        description="Elegí el modo de protección y revisá los dispositivos conectados."
      />
      {message && <Notice>{message}</Notice>}
      <Panel
        title="Modo de protección"
        description="El cambio se aplica en el servidor y queda registrado."
      >
        {mode.error ? (
          <ResourceError message={mode.error} retry={mode.reload} />
        ) : !mode.data ? (
          <Loading />
        ) : (
          <div className="mode-grid">
            {[
              {
                value: "AWAY",
                title: "Ausencia",
                detail: "Protección de zonas y accesos",
                icon: Shield,
              },
              {
                value: "HOME",
                title: "En casa",
                detail: "Observación mientras estás en el hogar",
                icon: House,
              },
              {
                value: "DISARMED",
                title: "Desarmado",
                detail: "Sin reglas de intrusión activas",
                icon: ShieldOff,
              },
            ].map((m) => (
              <button
                key={m.value}
                className={`mode-option ${currentMode === m.value ? "selected" : ""}`}
                aria-pressed={currentMode === m.value}
                disabled={Boolean(busy)}
                onClick={() => void changeMode(m.value)}
              >
                <m.icon size={25} />
                <strong>{m.title}</strong>
                <span>{m.detail}</span>
                {currentMode === m.value && (
                  <span className="active-label">Modo actual</span>
                )}
              </button>
            ))}
          </div>
        )}
      </Panel>
      <Panel
        title="Actuadores"
        description="Los comandos de esta demostración se confirman desde un simulador."
      >
        <div className="actuator-grid">
          {actuators.data?.items.map((a) => {
            const Icon =
              a.tipo === "SIRENA"
                ? Volume2
                : a.tipo === "VALVULA"
                  ? Droplets
                  : PlugZap;
            const waiting = a.last_command?.status === "REQUESTED";
            return (
              <div className="actuator-card" key={a.codigo}>
                <div className="actuator-top">
                  <span className="device-icon">
                    <Icon size={23} />
                  </span>
                  <span
                    className={`state-dot ${a.estado_actual === "ON" ? "on" : ""}`}
                  />
                </div>
                <h3>{a.nombre}</h3>
                <p className="muted text-small">
                  {a.estado_actual === "ON"
                    ? "Estado encendido"
                    : "Estado apagado"}
                </p>
                {a.last_command && (
                  <div className="command-status">
                    <Badge value={a.last_command.status} />
                    <small>
                      {a.last_command.confirmation_source === "SIMULATOR"
                        ? "Confirmación del simulador"
                        : waiting
                          ? "Esperando confirmación"
                          : ""}
                    </small>
                  </div>
                )}
                <button
                  className="button secondary wide"
                  disabled={Boolean(busy) || waiting}
                  onClick={() => void command(a)}
                >
                  <Power size={16} />
                  {busy === a.codigo
                    ? "Enviando…"
                    : waiting
                      ? "Comando pendiente"
                      : a.estado_actual === "ON"
                        ? "Solicitar apagado"
                        : "Solicitar encendido"}
                </button>
              </div>
            );
          })}
        </div>
        {actuators.error && (
          <ResourceError message={actuators.error} retry={actuators.reload} />
        )}
      </Panel>
      <div className="equal-columns">
        <Panel
          title="Sensores del hogar"
          description="Lecturas del sistema IoT existente."
        >
          <div className="sensor-list">
            {legacy.data?.dispositivos.map((s) => (
              <div className="sensor-row" key={s.tipo_sensor}>
                <span className="sensor-dot">
                  <Radio size={17} />
                </span>
                <strong>{s.tipo_sensor}</strong>
                <span>
                  {s.valor_numerico !== null
                    ? `${s.valor_numerico} ${s.unidad || ""}`
                    : (
                        {
                          CLOSED: "Cerrada",
                          OPEN: "Abierta",
                          NORMAL: "Normal",
                          DRY: "Seco",
                          MOTION_DETECTED: "Movimiento",
                          SMOKE_DETECTED: "Humo",
                          WATER_LEAK: "Agua detectada",
                        } as Record<string, string>
                      )[s.estado_texto] || s.estado_texto}
                </span>
              </div>
            ))}
            {!legacy.data?.dispositivos.length && (
              <p className="muted">Todavía no hay lecturas de sensores.</p>
            )}
          </div>
        </Panel>
        <Panel
          title="Consumo eléctrico"
          description="Última lectura recibida por MQTT."
        >
          <div className="energy-reading">
            <PlugZap size={28} />
            <strong>
              {legacy.data?.energia ? legacy.data.energia.potencia_w : "—"}
              <small>W</small>
            </strong>
            <span>Potencia instantánea</span>
          </div>
          <div className="energy-meta">
            <span>
              Voltaje<strong>{legacy.data?.energia?.voltaje_v ?? "—"} V</strong>
            </span>
            <span>
              Acumulado
              <strong>{legacy.data?.energia?.energia_kwh ?? "—"} kWh</strong>
            </span>
          </div>
        </Panel>
      </div>
      <Panel
        title="Distribución del hogar"
        description="Ubicaciones del plano IoT existente."
      >
        <svg
          className="floor-plan"
          viewBox="0 0 600 380"
          role="img"
          aria-label="Plano del hogar con ubicaciones de sensores"
        >
          <rect
            x="20"
            y="20"
            width="560"
            height="340"
            rx="5"
            fill="var(--surface-subtle)"
            stroke="var(--border)"
            strokeWidth="3"
          />
          <path
            d="M220 20V360M400 20V360M20 220H220M400 200H580"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
          />
          <text x="45" y="50">
            SALA
          </text>
          <text x="45" y="250">
            ENTRADA
          </text>
          <text x="250" y="50">
            PASILLO
          </text>
          <text x="425" y="50">
            COCINA
          </text>
          <text x="420" y="230">
            LAVANDERÍA
          </text>
          {legacy.data?.plano2D.map((pin) => (
            <g key={pin.id}>
              <circle
                cx={20 + pin.pos_x * 5.6}
                cy={20 + pin.pos_y * 3.4}
                r="9"
                fill="var(--accent)"
                stroke="white"
                strokeWidth="3"
              />
              <text
                x={20 + pin.pos_x * 5.6}
                y={42 + pin.pos_y * 3.4}
                textAnchor="middle"
              >
                {pin.etiqueta}
              </text>
            </g>
          ))}
        </svg>
        <p className="text-small muted">
          <Activity size={14} /> Las ubicaciones no sustituyen las zonas
          configuradas para video.
        </p>
      </Panel>
    </>
  );
}
