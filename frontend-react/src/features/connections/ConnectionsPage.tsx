import { useEffect, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  Plug,
  Plus,
  Radio,
  Settings,
  Trash2,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { useSession } from "../../app/SessionProvider";
import { useResource } from "../../shared/useResource";
import { api, errorMessage, refreshData } from "../../shared/api";
import {
  PageTitle,
  Panel,
  Notice,
  Empty,
  Loading,
  ResourceError,
  dateTime,
} from "../../shared/ui";
import {
  statusText,
  kindText,
  commandText,
  readingText,
  definitionOf,
} from "./models";
import type {
  Connection,
  Channel,
  Definition,
  Catalog,
  Provision,
} from "./models";
import "./connections.css";
const initial: Definition = {
  name: "",
  kind: "SENSOR",
  transport: "HTTP",
  location: "",
  model: "",
  enabled: true,
  heartbeat_seconds: 15,
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
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="connection-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <div className="connection-dialog-head">
        <h2>{title}</h2>
        <button
          className="button secondary"
          onClick={close}
          aria-label="Cerrar diálogo"
        >
          Cerrar
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ChannelReadings({
  connection,
  controls = true,
}: {
  connection: Connection;
  controls?: boolean;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function command(c: Channel, state: string) {
    setBusy(c.key);
    setError("");
    try {
      await api.post(`/connections/${connection.id}/commands`, {
        channel: c.key,
        state,
      });
      refreshData();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="connection-channels">
        {connection.channels.map((c) => (
          <div className="connection-channel" key={c.key}>
            <div>
              <strong>{c.name}</strong>
              <small>
                {c.key} · {c.type}
              </small>
            </div>
            <div>
              <strong>{readingText(c)}</strong>
              <small>
                {c.last_observed_at
                  ? `Medido: ${dateTime(c.last_observed_at)}`
                  : "El equipo aún no informó un valor"}
              </small>
              {c.last_received_at && (
                <small>Recibido: {dateTime(c.last_received_at)}</small>
              )}
            </div>
            {c.last_command && (
              <p className="command-detail">
                Solicitud {c.last_command.requested_state} ·{" "}
                {commandText[c.last_command.status] || c.last_command.status}
              </p>
            )}
            {controls && c.kind === "ACTUATOR" && (
              <div className="connection-actions">
                {(["ON", "OFF"] as const).map((s) => (
                  <button
                    className="button secondary"
                    key={s}
                    disabled={
                      !!busy ||
                      !connection.can_command ||
                      ["QUEUED", "SENT"].includes(c.last_command?.status || "")
                    }
                    onClick={() => void command(c, s)}
                  >
                    {busy === c.key
                      ? "Enviando…"
                      : s === "ON"
                        ? "Solicitar encendido"
                        : "Solicitar apagado"}
                  </button>
                ))}
                {!connection.can_command && (
                  <small>
                    Se necesita comunicación reciente para enviar comandos.
                  </small>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
export function ConnectionsPage() {
  const { user } = useSession(),
    admin = user?.rol === "ADMINISTRADOR";
  const list = useResource<{ items: Connection[] }>("/connections", 5000),
    catalog = useResource<Catalog>("/connections/catalog");
  const [editing, setEditing] = useState<Connection | null | undefined>(
      undefined,
    ),
    [provision, setProvision] = useState<Provision | null>(null),
    [remove, setRemove] = useState<Connection | null>(null),
    [rotate, setRotate] = useState<Connection | null>(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [filter, setFilter] = useState("ALL");
  async function mutate(c: Connection, action: "toggle" | "delete" | "rotate") {
    setBusy(c.id);
    setMessage("");
    try {
      if (action === "toggle")
        await api.patch(`/connections/${c.id}`, {
          ...definitionOf(c),
          enabled: !c.enabled,
          expected_revision: c.revision,
        });
      if (action === "delete") {
        await api.delete(`/connections/${c.id}`, {
          expected_revision: c.revision,
        });
        setRemove(null);
      }
      if (action === "rotate") {
        setProvision(
          await api.post<Provision>(`/connections/${c.id}/credentials`, {
            expected_revision: c.revision,
          }),
        );
        setRotate(null);
      }
      refreshData();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const items = list.data?.items || [],
    shown = items.filter((c) => filter === "ALL" || c.kind === filter);
  return (
    <>
      <PageTitle
        eyebrow="EQUIPOS DEL HOGAR"
        title="Conexiones"
        description="Registrá cámaras, sensores y salidas. Su estado depende de la comunicación recibida de cada equipo."
        action={
          admin && (
            <button className="button primary" onClick={() => setEditing(null)}>
              <Plus size={18} />
              Agregar equipo
            </button>
          )
        }
      />
      <Notice>
        Webcams del navegador y equipos compatibles con MQTT o HTTP. Registrar
        un equipo no genera lecturas. Para usar un sensor comercial, su firmware
        o una pasarela debe implementar el protocolo HomeGuard.
      </Notice>
      {message && <Notice tone="error">{message}</Notice>}
      <div className="connection-summary">
        <span>
          <strong>{items.length}</strong> registrados
        </span>
        <span>
          <strong>{items.filter((c) => c.status === "ONLINE").length}</strong>{" "}
          en línea
        </span>
        <span>
          <strong>{items.filter((c) => c.status === "WAITING").length}</strong>{" "}
          esperando datos
        </span>
        <button className="text-button" onClick={list.reload}>
          <RefreshCw size={15} />
          Actualizar
        </button>
      </div>
      <div className="connection-filter">
        <label>
          Mostrar
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">Todos los equipos</option>
            {Object.entries(kindText).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {list.error ? (
        <ResourceError message={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : !shown.length ? (
        <Panel>
          <Empty
            icon={<Plug size={30} />}
            title="Sin equipos registrados"
            description="Agregá una webcam o prepará un equipo MQTT/HTTP. Las lecturas aparecerán cuando se comunique."
          />
        </Panel>
      ) : (
        <div className="connections-grid">
          {shown.map((c) => (
            <Panel
              key={c.id}
              title={c.name}
              description={`${kindText[c.kind]} · ${c.transport} · ${c.location || "Sin ubicación"}`}
              action={
                <span
                  className={`connection-status status-${c.status.toLowerCase()}`}
                >
                  {statusText[c.status]}
                </span>
              }
            >
              <div className="connection-contact">
                {c.kind === "CAMERA" ? (
                  <Camera size={20} />
                ) : (
                  <Radio size={20} />
                )}
                <div>
                  <span>
                    Último contacto:{" "}
                    {c.last_seen ? dateTime(c.last_seen) : "Ninguno"}
                  </span>
                  <small>{c.model || "Sin modelo especificado"}</small>
                </div>
              </div>
              {c.status === "OFFLINE" && (
                <p className="muted text-small">
                  Las lecturas conservadas son históricas; el equipo perdió
                  comunicación.
                </p>
              )}
              {c.kind === "CAMERA" ? (
                <>
                  <p className="muted text-small">
                    La webcam se activa desde Cámaras. “En línea” requiere una
                    transmisión autorizada en el servidor de video.
                  </p>
                  <Link
                    className="button secondary"
                    to={`/cameras?camera=${c.camera_id}`}
                  >
                    Abrir cámara
                  </Link>
                </>
              ) : (
                <ChannelReadings connection={c} />
              )}
              {admin && (
                <div className="connection-actions connection-admin">
                  <button className="text-button" onClick={() => setEditing(c)}>
                    <Settings size={15} />
                    Configurar
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => void mutate(c, "toggle")}
                  >
                    {c.enabled ? "Deshabilitar" : "Habilitar"}
                  </button>
                  {c.kind !== "CAMERA" && (
                    <button
                      className="text-button"
                      onClick={() => setRotate(c)}
                    >
                      <KeyRound size={15} />
                      Renovar token
                    </button>
                  )}
                  <button
                    className="text-button danger-text"
                    onClick={() => setRemove(c)}
                  >
                    <Trash2 size={15} />
                    Eliminar
                  </button>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
      <Panel
        title="Cómo se conectan"
        description="Cada equipo tiene una configuración y credencial propias."
      >
        <ol className="connection-guide">
          <li>
            Registrá el equipo y definí sus canales; un controlador puede tener
            hasta 16.
          </li>
          <li>
            Guardá el token que se muestra una sola vez y configurá el firmware
            con las instrucciones del diálogo.
          </li>
          <li>
            El equipo envía su primera medición o un heartbeat. Solo entonces
            cambia su estado de comunicación.
          </li>
          <li>
            Los actuadores deben responder con un ACK del comando; enviar la
            solicitud no prueba que una salida física haya cambiado.
          </li>
        </ol>
        <p className="muted text-small">
          Sin hardware conectado, los equipos quedan esperando datos. El sistema
          no descubre sensores USB, Zigbee, Bluetooth o de marcas privadas de
          forma automática.
        </p>
      </Panel>
      {editing !== undefined && (
        <Dialog
          title={editing ? "Configurar equipo" : "Agregar equipo"}
          close={() => setEditing(undefined)}
        >
          {catalog.error ? (
            <ResourceError message={catalog.error} retry={catalog.reload} />
          ) : catalog.data ? (
            <ConnectionForm
              existing={editing}
              catalog={catalog.data}
              cancel={() => setEditing(undefined)}
              saved={(result) => {
                setEditing(undefined);
                if (result.credentials) setProvision(result);
                refreshData();
              }}
            />
          ) : (
            <Loading />
          )}
        </Dialog>
      )}
      {provision?.credentials && (
        <ProvisionDialog
          provision={provision}
          close={() => setProvision(null)}
        />
      )}
      {remove && (
        <Dialog title="Eliminar conexión" close={() => setRemove(null)}>
          <p>
            Se eliminará el vínculo de <strong>{remove.name}</strong>, se
            revocará su credencial y se cancelarán sus comandos pendientes. El
            historial se conserva.
          </p>
          <button
            className="button primary"
            disabled={!!busy}
            onClick={() => void mutate(remove, "delete")}
          >
            Confirmar eliminación
          </button>
        </Dialog>
      )}
      {rotate && (
        <Dialog title="Renovar credencial" close={() => setRotate(null)}>
          <p>
            El token anterior de <strong>{rotate.name}</strong> dejará de
            funcionar. Tendrás que configurar el nuevo token en el equipo y
            esperar que vuelva a comunicarse.
          </p>
          <button
            className="button primary"
            disabled={!!busy}
            onClick={() => void mutate(rotate, "rotate")}
          >
            Generar nuevo token
          </button>
        </Dialog>
      )}
    </>
  );
}
function ConnectionForm({
  existing,
  catalog,
  saved,
  cancel,
}: {
  existing: Connection | null;
  catalog: Catalog;
  saved: (r: Provision) => void;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState<Definition>(() =>
      existing ? definitionOf(existing) : structuredClone(initial),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function kind(value: Definition["kind"]) {
    setDraft((d) => ({
      ...d,
      kind: value,
      transport:
        value === "CAMERA"
          ? "WEBCAM"
          : d.transport === "WEBCAM"
            ? "HTTP"
            : d.transport,
      webcam_device_id: null,
      channels:
        value === "CAMERA"
          ? []
          : [
              {
                key: "main",
                name: value === "ACTUATOR" ? "Salida" : "Temperatura",
                kind: value === "ACTUATOR" ? "ACTUATOR" : "SENSOR",
                type: value === "ACTUATOR" ? "RELAY" : "TEMPERATURE",
                unit: value === "ACTUATOR" ? "" : "°C",
              },
            ],
    }));
  }
  async function detect() {
    setBusy(true);
    setError("");
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "La webcam requiere localhost o HTTPS y permiso del navegador.",
        );
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      const found = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput",
      );
      if (mounted.current) setDevices(found);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      if (mounted.current) setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
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
      saved(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="connection-form" onSubmit={(e) => void submit(e)}>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="connection-form-grid">
        <label>
          Nombre
          <input
            required
            minLength={2}
            maxLength={100}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Temperatura cocina"
          />
        </label>
        <label>
          Tipo de equipo
          <select
            disabled={!!existing}
            value={draft.kind}
            onChange={(e) => kind(e.target.value as Definition["kind"])}
          >
            {Object.entries(kindText).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Conexión
          <select
            disabled={!!existing || draft.kind === "CAMERA"}
            value={draft.transport}
            onChange={(e) =>
              setDraft({
                ...draft,
                transport: e.target.value as Definition["transport"],
              })
            }
          >
            {draft.kind === "CAMERA" ? (
              <option value="WEBCAM">Webcam / navegador</option>
            ) : (
              <>
                <option value="HTTP">
                  HTTP · envío de datos y consulta de comandos
                </option>
                <option value="MQTT">MQTT · broker local autenticado</option>
              </>
            )}
          </select>
        </label>
        <label>
          Ubicación
          <input
            maxLength={100}
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder="Cocina"
          />
        </label>
        <label>
          Modelo / descripción
          <input
            maxLength={100}
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            placeholder="ESP32 con sensor de temperatura"
          />
        </label>
        {draft.kind !== "CAMERA" && (
          <label>
            Heartbeat esperado (segundos)
            <input
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
          </label>
        )}
      </div>
      {draft.kind === "CAMERA" ? (
        <div className="webcam-config">
          <p>
            El permiso se solicita al pulsar el botón. La detección libera la
            webcam al terminar.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void detect()}
          >
            Detectar webcams
          </button>
          <label>
            Webcam de este navegador
            <select
              value={draft.webcam_device_id || ""}
              onChange={(e) =>
                setDraft({ ...draft, webcam_device_id: e.target.value || null })
              }
            >
              <option value="">
                Cámara predeterminada / elegir al transmitir
              </option>
              {draft.webcam_device_id &&
                !devices.some((d) => d.deviceId === draft.webcam_device_id) && (
                  <option value={draft.webcam_device_id}>
                    Webcam guardada en otro navegador
                  </option>
                )}
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Webcam"}
                </option>
              ))}
            </select>
          </label>
          <small>
            Los identificadores dependen del navegador. Registrarla no inicia la
            grabación.
          </small>
        </div>
      ) : (
        <fieldset>
          <legend>Canales del equipo</legend>
          <p className="muted text-small">
            La clave debe coincidir con el firmware. Booleanos: true = detección
            / puerta abierta; false = sin detección / cerrada.
          </p>
          {draft.channels.map((c, i) => (
            <div className="channel-editor" key={i}>
              <label>
                Clave
                <input
                  required
                  pattern="[a-z][a-z0-9_-]{0,31}"
                  value={c.key}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      channels: draft.channels.map((x, n) =>
                        n === i ? { ...x, key: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Nombre del canal
                <input
                  required
                  maxLength={80}
                  value={c.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      channels: draft.channels.map((x, n) =>
                        n === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              {draft.kind === "GATEWAY" && (
                <label>
                  Entrada / salida
                  <select
                    value={c.kind}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        channels: draft.channels.map((x, n) =>
                          n === i
                            ? {
                                ...x,
                                kind: e.target.value as "SENSOR" | "ACTUATOR",
                                type:
                                  e.target.value === "SENSOR"
                                    ? "TEMPERATURE"
                                    : "RELAY",
                                unit: e.target.value === "SENSOR" ? "°C" : "",
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    <option value="SENSOR">Sensor</option>
                    <option value="ACTUATOR">Actuador</option>
                  </select>
                </label>
              )}
              <label>
                Tipo de canal
                <select
                  value={c.type}
                  onChange={(e) => {
                    const type = (
                      c.kind === "SENSOR"
                        ? catalog.sensor_types
                        : catalog.actuator_types
                    ).find((t) => t.id === e.target.value)!;
                    setDraft({
                      ...draft,
                      channels: draft.channels.map((x, n) =>
                        n === i ? { ...x, type: type.id, unit: type.unit } : x,
                      ),
                    });
                  }}
                >
                  {(c.kind === "SENSOR"
                    ? catalog.sensor_types
                    : catalog.actuator_types
                  ).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              {c.type === "NUMBER" && (
                <label>
                  Unidad
                  <input
                    maxLength={16}
                    value={c.unit}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        channels: draft.channels.map((x, n) =>
                          n === i ? { ...x, unit: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
              )}
              {draft.kind === "GATEWAY" && draft.channels.length > 1 && (
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      channels: draft.channels.filter((_, n) => n !== i),
                    })
                  }
                >
                  Quitar canal
                </button>
              )}
            </div>
          ))}
          {draft.kind === "GATEWAY" && (
            <button
              type="button"
              className="button secondary"
              disabled={draft.channels.length >= 16}
              onClick={() =>
                setDraft({
                  ...draft,
                  channels: [
                    ...draft.channels,
                    {
                      key: `ch${Date.now().toString(36)}`,
                      name: "Nuevo canal",
                      kind: "SENSOR",
                      type: "TEMPERATURE",
                      unit: "°C",
                    },
                  ],
                })
              }
            >
              Agregar canal
            </button>
          )}
        </fieldset>
      )}
      <label className="connection-checkbox">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        Equipo habilitado
      </label>
      <div className="connection-actions">
        <button className="button primary" disabled={busy}>
          {busy
            ? "Guardando…"
            : existing
              ? "Guardar configuración"
              : "Registrar equipo"}
        </button>
        <button className="button secondary" type="button" onClick={cancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
function ProvisionDialog({
  provision,
  close,
}: {
  provision: Provision;
  close: () => void;
}) {
  const credential = provision.credentials!,
    c = provision.connection,
    [copied, setCopied] = useState(""),
    host = window.location.hostname;
  return (
    <Dialog title="Credencial del equipo · guardar ahora" close={close}>
      <Notice>
        Este token se muestra una sola vez. Guardalo en el firmware del equipo;
        para recuperarlo después tendrás que generar otro.
      </Notice>
      <label>
        Token del dispositivo
        <textarea className="device-token" readOnly value={credential.token} />
      </label>
      <button
        className="button secondary"
        onClick={() =>
          void navigator.clipboard.writeText(credential.token).then(
            () => setCopied("Token copiado."),
            () => setCopied("Seleccioná el token y copialo manualmente."),
          )
        }
      >
        Copiar token
      </button>
      {copied && <p role="status">{copied}</p>}
      {c.transport === "HTTP" ? (
        <>
          <h3>Enlace HTTP</h3>
          <p>
            Base del equipo:{" "}
            <code>
              http://{host}:3000{credential.http_path}
            </code>
          </p>
          <p>
            Cabecera: <code>Authorization: Bearer TU_TOKEN</code>
          </p>
          <p>
            POST <code>/telemetry</code> para lecturas; GET <code>/config</code>{" "}
            para canales. Los actuadores consultan GET <code>/commands</code> y
            responden POST <code>/ack</code>.
          </p>
        </>
      ) : (
        <>
          <h3>Enlace MQTT</h3>
          <p>
            Servidor: <code>{host}:1883</code>
          </p>
          <p>
            Usuario y clientId: <code>{credential.username}</code>. Contraseña:
            el token. MQTT 3.1.1, clean session activado, sin retain ni will.
          </p>
          <dl>
            <dt>Publicar lecturas</dt>
            <dd>
              <code>{credential.topics.telemetry}</code>
            </dd>
            <dt>Recibir comandos</dt>
            <dd>
              <code>{credential.topics.commands}</code>
            </dd>
            <dt>Publicar confirmaciones</dt>
            <dd>
              <code>{credential.topics.ack}</code>
            </dd>
          </dl>
        </>
      )}
      <h3>Primer mensaje</h3>
      <p>
        Este heartbeat acredita contacto sin inventar una medición. El firmware
        debe generar un UUID distinto para cada mensaje.
      </p>
      <pre>
        {JSON.stringify(
          {
            schema_version: "1.0",
            message_id: "UUID-NUEVO-POR-MENSAJE",
            heartbeat: true,
            readings: [],
          },
          null,
          2,
        )}
      </pre>
      <p>
        Canales configurados:{" "}
        {c.channels.map((ch) => `${ch.key} (${ch.type})`).join(", ")}.
      </p>
      <p className="muted text-small">
        Para otro equipo de la red, usá la IP privada de esta PC y arrancá
        HomeGuard con <code>Iniciar.ps1 -Interfaz TU_IP_PRIVADA</code>.
        localhost siempre apunta al propio equipo. HTTP y MQTT locales no usan
        cifrado: utilizalos en una red privada de pruebas; el acceso remoto
        requiere HTTPS y TLS.
      </p>
      <button className="button primary" onClick={close}>
        Ya guardé la credencial
      </button>
    </Dialog>
  );
}
