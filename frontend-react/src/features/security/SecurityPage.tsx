import { Link } from "react-router-dom";
import { ChannelReadings } from "../connections/ConnectionsPage";
import type { Connection } from "../connections/models";
import { useState } from "react";
import {
  Shield,
  House,
  ShieldOff,
  Power,
  PlugZap,
  Droplets,
  Volume2,
} from "lucide-react";
import { useResource } from "../../shared/useResource";
import type { ModeView, Actuator, Page } from "../../shared/models";
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
    connections = useResource<{ items: Connection[] }>("/connections", 5000);
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
        title="Sensores del hogar"
        description="Mediciones recibidas de los equipos registrados. Una lectura anterior no garantiza el estado actual."
      >
        {connections.error ? (
          <ResourceError
            message={connections.error}
            retry={connections.reload}
          />
        ) : !connections.data ? (
          <Loading />
        ) : !connections.data.items.some((c) =>
            c.channels.some((ch) => ch.kind === "SENSOR"),
          ) ? (
          <p className="muted">
            Sin sensores reales vinculados.{" "}
            <Link to="/connections">Configurar en Conexiones</Link>
          </p>
        ) : (
          connections.data.items
            .filter((c) => c.channels.some((ch) => ch.kind === "SENSOR"))
            .map((c) => (
              <div key={c.id}>
                <h3>
                  {c.name} · {c.location || "Sin ubicación"}
                </h3>
                <Badge value={c.status} />
                <ChannelReadings
                  connection={{
                    ...c,
                    channels: c.channels.filter((ch) => ch.kind === "SENSOR"),
                  }}
                  controls={false}
                />
              </div>
            ))
        )}
      </Panel>
      <Panel
        title="Actuadores conectados"
        description="Los comandos requieren contacto reciente y una confirmación enviada por el equipo."
      >
        {connections.error ? (
          <ResourceError
            message={connections.error}
            retry={connections.reload}
          />
        ) : !connections.data ? (
          <Loading />
        ) : (
          connections.data.items
            .filter((c) => c.channels.some((ch) => ch.kind === "ACTUATOR"))
            .map((c) => (
              <div key={c.id}>
                <h3>{c.name}</h3>
                <Badge value={c.status} />
                <ChannelReadings
                  connection={{
                    ...c,
                    channels: c.channels.filter((ch) => ch.kind === "ACTUATOR"),
                  }}
                />
              </div>
            ))
        )}
        {!connections.error &&
          connections.data &&
          !connections.data.items.some((c) =>
            c.channels.some((ch) => ch.kind === "ACTUATOR"),
          ) && (
            <p className="muted">
              Sin actuadores reales vinculados.{" "}
              <Link to="/connections">Agregar equipo</Link>
            </p>
          )}
      </Panel>
      <details className="panel">
        <summary>Demostración de actuadores · estados simulados</summary>
        <p className="muted">
          Estos controles pertenecen al simulador universitario. No representan
          equipos físicos. El simulador se inicia explícitamente con
          -ConSimulador.
        </p>
        <Panel
          title="Actuadores simulados"
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
      </details>
    </>
  );
}
