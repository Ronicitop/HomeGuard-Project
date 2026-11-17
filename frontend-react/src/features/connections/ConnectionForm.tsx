import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Camera,
  Radio,
  PlugZap,
  Network,
  ArrowLeft,
  SlidersHorizontal,
} from "lucide-react";
import { api, errorMessage } from "../../shared/api";
import { Notice } from "../../shared/ui";
import { definitionOf } from "./models";
import type {
  Catalog,
  ChannelDefinition,
  Connection,
  Definition,
  Provision,
} from "./models";
const choices = [
  {
    kind: "CAMERA",
    label: "Cámara",
    description: "Una webcam conectada a esta computadora.",
    icon: Camera,
  },
  {
    kind: "SENSOR",
    label: "Sensor",
    description: "Puerta, movimiento, temperatura, humo y más.",
    icon: Radio,
  },
  {
    kind: "ACTUATOR",
    label: "Luz, alarma u otra salida",
    description: "Un equipo que querés encender o apagar.",
    icon: PlugZap,
  },
  {
    kind: "GATEWAY",
    label: "Equipo con varios sensores",
    description: "Un controlador que reúne varias mediciones o salidas.",
    icon: Network,
  },
] as const;
const initial: Definition = {
  name: "",
  kind: "SENSOR",
  transport: "HTTP",
  location: "",
  model: "",
  heartbeat_seconds: 15,
  enabled: true,
  webcam_device_id: null,
  channels: [
    {
      key: "main",
      name: "Temperatura",
      kind: "SENSOR",
      type: "TEMPERATURE",
      unit: "°C",
    },
  ],
};
export function ConnectionForm({
  existing,
  catalog,
  saved,
  cancel,
  onSavingChange,
}: {
  existing: Connection | null;
  catalog: Catalog;
  saved: (r: Provision) => void;
  cancel: () => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const [draft, setDraft] = useState<Definition>(() =>
      existing ? definitionOf(existing) : structuredClone(initial),
    ),
    [stage, setStage] = useState<"choose" | "details">(
      existing ? "details" : "choose",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [detection, setDetection] = useState("");
  const mounted = useRef(true),
    nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (stage === "details") nameInput.current?.focus();
  }, [stage]);
  function choose(kind: Definition["kind"]) {
    if (kind !== draft.kind)
      setDraft((d) => ({
        ...d,
        kind,
        transport:
          kind === "CAMERA"
            ? "WEBCAM"
            : d.transport === "WEBCAM"
              ? "HTTP"
              : d.transport,
        webcam_device_id: null,
        channels:
          kind === "CAMERA"
            ? []
            : [
                {
                  key: "main",
                  name: kind === "ACTUATOR" ? "Salida" : "Temperatura",
                  kind: kind === "ACTUATOR" ? "ACTUATOR" : "SENSOR",
                  type: kind === "ACTUATOR" ? "RELAY" : "TEMPERATURE",
                  unit: kind === "ACTUATOR" ? "" : "°C",
                },
              ],
      }));
    setError("");
    setDetection("");
    setStage("details");
  }
  function channel(index: number, patch: Partial<ChannelDefinition>) {
    setDraft((d) => ({
      ...d,
      channels: d.channels.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    }));
  }
  function channelType(index: number, id: string) {
    const c = draft.channels[index],
      types =
        c.kind === "SENSOR" ? catalog.sensor_types : catalog.actuator_types,
      type = types.find((t) => t.id === id)!;
    const old = types.find((t) => t.id === c.type);
    channel(index, {
      type: id,
      unit: type.unit,
      name:
        c.name === old?.label ||
        c.name === "Salida" ||
        c.name === "Nueva medición"
          ? type.label
          : c.name,
    });
  }
  async function detect() {
    setBusy(true);
    setError("");
    setDetection("");
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Para buscar cámaras, abrí HomeGuard en esta computadora mediante localhost o una dirección HTTPS.",
        );
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      const found = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput",
      );
      if (mounted.current) {
        setDevices(found);
        setDetection(
          found.length
            ? `${found.length === 1 ? "Encontramos una cámara" : "Encontramos " + found.length + " cámaras"}. Podés elegirla abajo.`
            : "No encontramos cámaras. Revisá que la webcam esté conectada.",
        );
        if (found.length === 1)
          setDraft((d) => ({ ...d, webcam_device_id: found[0].deviceId }));
      }
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      if (mounted.current) setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (stage !== "details" || busy) return;
    setBusy(true);
    onSavingChange?.(true);
    setError("");
    try {
      const result = existing
        ? {
            connection: await api.patch<Connection>(
              `/connections/${existing.id}`,
              { ...draft, expected_revision: existing.revision },
            ),
            credentials: null,
          }
        : await api.post<Provision>("/connections", draft);
      if (mounted.current) saved(result);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      onSavingChange?.(false);
      if (mounted.current) setBusy(false);
    }
  }
  const selected = choices.find((c) => c.kind === draft.kind)!;
  return (
    <form
      className="connection-form"
      onSubmit={(e) => void submit(e)}
      onInvalidCapture={(e) => {
        if (e.target instanceof HTMLElement)
          e.target.closest("details")?.setAttribute("open", "");
      }}
    >
      {!existing && (
        <ol
          className="connection-steps"
          aria-label="Pasos para agregar un equipo"
        >
          <li aria-current={stage === "choose" ? "step" : undefined}>
            <span>1</span>Elegí el equipo
          </li>
          <li aria-current={stage === "details" ? "step" : undefined}>
            <span>2</span>Personalizalo
          </li>
        </ol>
      )}
      {stage === "choose" ? (
        <>
          <h3 className="connection-step-title">¿Qué querés conectar?</h3>
          <p className="muted">Elegí el que más se parezca a tu equipo.</p>
          <div className="connection-type-choices">
            {choices.map((c) => (
              <button
                className="connection-type-choice"
                type="button"
                key={c.kind}
                aria-label={c.label}
                aria-describedby={`choice-${c.kind}`}
                onClick={() => choose(c.kind)}
              >
                <span className="connection-choice-icon">
                  <c.icon size={25} />
                </span>
                <strong>{c.label}</strong>
                <span id={`choice-${c.kind}`}>{c.description}</span>
              </button>
            ))}
          </div>
          <div className="connection-actions">
            <button
              className="button secondary"
              type="button"
              onClick={cancel}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="connection-chosen">
            <span className="connection-choice-icon">
              <selected.icon size={22} />
            </span>
            <div>
              <strong>{selected.label}</strong>
              <small>
                {existing
                  ? "Podés actualizar sus datos."
                  : "Elegí un nombre fácil de reconocer."}
              </small>
            </div>
            {!existing && (
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => setStage("choose")}
              >
                <ArrowLeft size={15} />
                Cambiar equipo
              </button>
            )}
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="connection-form-grid">
            <label>
              Nombre
              <input
                ref={nameInput}
                required
                minLength={2}
                maxLength={100}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={
                  draft.kind === "CAMERA"
                    ? "Cámara del patio"
                    : draft.kind === "ACTUATOR"
                      ? "Luz de la entrada"
                      : "Sensor de la cocina"
                }
              />
            </label>
            <label>
              Ubicación
              <input
                aria-label="Ubicación"
                maxLength={100}
                value={draft.location}
                onChange={(e) =>
                  setDraft({ ...draft, location: e.target.value })
                }
                placeholder="Elegí o escribí un lugar"
                list="connection-rooms"
              />
              <datalist id="connection-rooms">
                {[
                  "Entrada",
                  "Cocina",
                  "Sala",
                  "Dormitorio",
                  "Patio",
                  "Garaje",
                ].map((room) => (
                  <option key={room} value={room} />
                ))}
              </datalist>
              <small className="muted">
                Opcional. Por ejemplo, cocina o entrada.
              </small>
            </label>
          </div>
          {draft.kind === "CAMERA" ? (
            <div className="webcam-config">
              <h3>Elegí la cámara</h3>
              <p className="muted">
                Conectá la webcam y permití el acceso cuando el navegador lo
                solicite.
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void detect()}
              >
                <Camera size={17} />
                {busy ? "Buscando…" : "Buscar cámaras"}
              </button>
              {detection && <p role="status">{detection}</p>}
              <label>
                Cámara a utilizar
                <select
                  value={draft.webcam_device_id || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      webcam_device_id: e.target.value || null,
                    })
                  }
                >
                  <option value="">
                    La cámara predeterminada de esta computadora
                  </option>
                  {draft.webcam_device_id &&
                    !devices.some(
                      (d) => d.deviceId === draft.webcam_device_id,
                    ) && (
                      <option value={draft.webcam_device_id}>
                        Cámara elegida anteriormente
                      </option>
                    )}
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Webcam"}
                    </option>
                  ))}
                </select>
              </label>
              <small className="muted">
                Buscar cámaras no deja una grabación activa. Después de
                registrarla podrás abrirla desde Cámaras.
              </small>
            </div>
          ) : (
            <div className="connection-functions">
              {draft.kind === "GATEWAY" && (
                <>
                  <h3>¿Qué tiene conectado este equipo?</h3>
                  <p className="muted">
                    Agregá cada sensor o salida que quieras usar.
                  </p>
                </>
              )}
              {draft.channels.map((c, i) => (
                <div
                  className={
                    draft.kind === "GATEWAY" ? "connection-function-card" : ""
                  }
                  key={i}
                >
                  {draft.kind === "GATEWAY" && (
                    <div className="connection-form-grid">
                      <label>
                        Nombre de la medición o salida
                        <input
                          required
                          maxLength={80}
                          value={c.name}
                          onChange={(e) => channel(i, { name: e.target.value })}
                        />
                      </label>
                      <label>
                        ¿Para qué sirve?
                        <select
                          value={c.kind}
                          onChange={(e) => {
                            const kind = e.target.value as
                              | "SENSOR"
                              | "ACTUATOR";
                            channel(i, {
                              kind,
                              type: kind === "SENSOR" ? "TEMPERATURE" : "RELAY",
                              unit: kind === "SENSOR" ? "°C" : "",
                            });
                          }}
                        >
                          <option value="SENSOR">Medir o detectar algo</option>
                          <option value="ACTUATOR">
                            Encender o apagar algo
                          </option>
                        </select>
                      </label>
                    </div>
                  )}
                  <label>
                    {c.kind === "SENSOR"
                      ? "¿Qué mide o detecta?"
                      : "¿Qué querés controlar?"}
                    <select
                      value={c.type}
                      onChange={(e) => channelType(i, e.target.value)}
                    >
                      {(c.kind === "SENSOR"
                        ? catalog.sensor_types
                        : catalog.actuator_types
                      ).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.id === "RELAY" ? "Interruptor o relé" : t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.kind === "GATEWAY" && draft.channels.length > 1 && (
                    <button
                      className="text-button danger-text"
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          channels: draft.channels.filter((_, n) => n !== i),
                        })
                      }
                    >
                      Quitar esta medición o salida
                    </button>
                  )}
                </div>
              ))}
              {draft.kind === "GATEWAY" && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={draft.channels.length >= 16}
                  onClick={() => {
                    let n = 1;
                    while (draft.channels.some((c) => c.key === `ch${n}`)) n++;
                    setDraft({
                      ...draft,
                      channels: [
                        ...draft.channels,
                        {
                          key: `ch${n}`,
                          name: "Nueva medición",
                          kind: "SENSOR",
                          type: "TEMPERATURE",
                          unit: "°C",
                        },
                      ],
                    });
                  }}
                >
                  Agregar sensor o salida
                </button>
              )}
              <p className="connection-install-note">
                Al guardar, recibirás la configuración para quien instala el
                equipo. Las lecturas aparecerán cuando el dispositivo se
                conecte.
              </p>
            </div>
          )}
          <details className="connection-advanced">
            <summary>
              <SlidersHorizontal size={16} />
              Opciones avanzadas <span>(opcional)</span>
            </summary>
            <p className="muted text-small">
              Para quien instala el equipo. Podés dejar estos valores como están
              si solo querés registrarlo.
            </p>
            <div className="connection-form-grid">
              <label>
                Modelo / descripción
                <input
                  maxLength={100}
                  value={draft.model}
                  onChange={(e) =>
                    setDraft({ ...draft, model: e.target.value })
                  }
                />
              </label>
              {draft.kind !== "CAMERA" && (
                <>
                  <label>
                    Modo de conexión
                    <select
                      aria-label="Modo de conexión"
                      disabled={!!existing}
                      value={draft.transport}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          transport: e.target.value as Definition["transport"],
                        })
                      }
                    >
                      <option value="HTTP">Envío directo (HTTP)</option>
                      <option value="MQTT">Mensajería (MQTT)</option>
                    </select>
                    <small className="muted">
                      Debe coincidir con la configuración del dispositivo.
                    </small>
                  </label>
                  <label>
                    Frecuencia de contacto (segundos)
                    <input
                      aria-label="Frecuencia de contacto (segundos)"
                      required
                      type="number"
                      min={5}
                      max={3600}
                      value={draft.heartbeat_seconds}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          heartbeat_seconds: Number(e.target.value),
                        })
                      }
                    />
                    <small className="muted">
                      Cada cuánto debe avisar que sigue conectado.
                    </small>
                  </label>
                </>
              )}
            </div>
            {draft.kind !== "CAMERA" && (
              <fieldset>
                <legend>Identificadores para el instalador</legend>
                <p className="muted text-small">
                  Las claves deben coincidir con el programa del dispositivo.
                </p>
                {draft.channels.map((c, i) => (
                  <div className="channel-editor" key={i}>
                    <label>
                      {draft.channels.length === 1
                        ? "Clave del canal"
                        : `Clave del canal ${i + 1}`}
                      <input
                        required
                        pattern="[a-z][a-z0-9_-]{0,31}"
                        value={c.key}
                        onChange={(e) => channel(i, { key: e.target.value })}
                      />
                    </label>
                    {draft.kind !== "GATEWAY" && (
                      <label>
                        Nombre de la medición
                        <input
                          required
                          maxLength={80}
                          value={c.name}
                          onChange={(e) => channel(i, { name: e.target.value })}
                        />
                      </label>
                    )}
                    {c.type === "NUMBER" && (
                      <label>
                        Unidad de medida
                        <input
                          maxLength={16}
                          value={c.unit}
                          onChange={(e) => channel(i, { unit: e.target.value })}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </fieldset>
            )}
            <label className="connection-checkbox">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, enabled: e.target.checked })
                }
              />
              Equipo habilitado
            </label>
          </details>
          <div className="connection-actions">
            <button className="button primary" disabled={busy}>
              {busy
                ? "Guardando…"
                : existing
                  ? "Guardar configuración"
                  : "Registrar equipo"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={cancel}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </form>
  );
}
