import { ConnectionForm } from "./ConnectionForm";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  Download,
  CheckCircle2,
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
  installerConfiguration,
} from "./models";
import type { Connection, Channel, Catalog, Provision } from "./models";
import "./connections.css";
function Dialog({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
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
        if (!busy) close();
      }}
      aria-label={title}
    >
      <div className="connection-dialog-head">
        <h2>{title}</h2>
        <button
          className="button secondary"
          onClick={close}
          aria-label="Cerrar diálogo"
          disabled={busy}
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
    [editorSaving, setEditorSaving] = useState(false),
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
        Agregá tus cámaras y dispositivos en pocos pasos. Sus lecturas
        aparecerán cuando estén conectados; registrar un equipo no genera datos
        de ejemplo.
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
            description="Empezá por agregar una cámara, un sensor o un equipo que quieras controlar. Te guiaremos paso a paso."
          />
        </Panel>
      ) : (
        <div className="connections-grid">
          {shown.map((c) => (
            <Panel
              key={c.id}
              title={c.name}
              description={`${kindText[c.kind]} · ${c.location || "Sin ubicación"}`}
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
                      Renovar clave
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
        description="Unos pocos pasos para empezar."
      >
        <ol className="connection-guide">
          <li>Pulsá Agregar equipo y elegí lo que querés conectar.</li>
          <li>Dale un nombre y una ubicación para reconocerlo fácilmente.</li>
          <li>
            Si es una cámara, abrila desde Cámaras. Si es un sensor u otro
            dispositivo, descargá la configuración para quien lo instala.
          </li>
          <li>
            Esperá a que el equipo se conecte. Podrás ver sus datos y la fecha
            de la última comunicación.
          </li>
        </ol>
        <p className="muted text-small">
          Si todavía no tenés el equipo, podés dejarlo registrado. Aparecerá
          esperando datos hasta que completes la conexión.
        </p>
        <details className="connection-advanced">
          <summary>Compatibilidad y ayuda para el instalador</summary>
          <p className="muted text-small">
            Se admiten webcams del navegador y equipos que implementen el
            protocolo HTTP o MQTT de HomeGuard. Los sensores necesitan firmware
            o una pasarela compatible; no se descubren automáticamente
            dispositivos USB, Zigbee, Bluetooth o de marcas privadas. Una orden
            de encendido necesita confirmación del dispositivo para mostrarse
            como atendida.
          </p>
        </details>
      </Panel>
      {editing !== undefined && (
        <Dialog
          title={editing ? "Configurar equipo" : "Agregar equipo"}
          close={() => {
            if (!editorSaving) setEditing(undefined);
          }}
          busy={editorSaving}
        >
          {catalog.error ? (
            <ResourceError message={catalog.error} retry={catalog.reload} />
          ) : catalog.data ? (
            <ConnectionForm
              existing={editing}
              catalog={catalog.data}
              cancel={() => setEditing(undefined)}
              onSavingChange={setEditorSaving}
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
    [downloaded, setDownloaded] = useState(false),
    [downloadError, setDownloadError] = useState(""),
    host = window.location.hostname;
  function download() {
    let url: string | undefined;
    try {
      const file = new Blob(
        [JSON.stringify(installerConfiguration(provision, host), null, 2)],
        { type: "application/json" },
      );
      url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `homeguard-${c.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloaded(true);
      setDownloadError("");
    } catch {
      setDownloadError(
        "No se pudo iniciar la descarga. Podés copiar la clave desde los detalles técnicos.",
      );
    } finally {
      if (url) {
        const address = url;
        setTimeout(() => URL.revokeObjectURL(address), 1000);
      }
    }
  }
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(credential.token);
      setCopied("Clave copiada.");
    } catch {
      setCopied("Seleccioná la clave y copiala manualmente.");
    }
  }
  return (
    <Dialog title="Preparar conexión" close={close}>
      <div className="connection-provision-result">
        <CheckCircle2 size={28} />
        <div>
          <h3>{c.name} ya está registrado</h3>
          <p className="muted">
            Falta conectar el dispositivo para recibir sus datos.
          </p>
        </div>
      </div>
      <p>
        Descargá la configuración y entregásela a quien instala el equipo.
        Incluye los datos que necesita para vincularlo con HomeGuard.
      </p>
      <Notice>
        La clave privada se muestra una sola vez. Guardá el archivo y compartilo
        solo con quien instala el equipo. Si lo perdés, podrás generar otra
        clave desde Conexiones.
      </Notice>
      <button className="button primary" onClick={download}>
        <Download size={18} />
        Descargar configuración
      </button>
      {downloaded && (
        <p role="status" className="connection-download-success">
          Descarga iniciada. Conservá el archivo para completar la instalación.
        </p>
      )}
      {downloadError && <Notice tone="error">{downloadError}</Notice>}
      <p className="muted text-small">
        Registrar el equipo no lo conecta automáticamente. Quien lo instala debe
        indicar la dirección de esta PC en la red.
      </p>
      <details className="connection-advanced connection-installer-details">
        <summary>Ver detalles técnicos para el instalador</summary>
        <label>
          Token del dispositivo
          <textarea
            className="device-token"
            readOnly
            value={credential.token}
          />
        </label>
        <button className="button secondary" onClick={() => void copy()}>
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
              POST <code>/telemetry</code> para lecturas; GET{" "}
              <code>/config</code> para canales. Los actuadores consultan GET{" "}
              <code>/commands</code> y responden POST <code>/ack</code>.
            </p>
          </>
        ) : (
          <>
            <h3>Enlace MQTT</h3>
            <p>
              Servidor: <code>{host}:1883</code>
            </p>
            <p>
              Usuario y clientId: <code>{credential.username}</code>.
              Contraseña: el token. MQTT 3.1.1, clean session activado, sin
              retain ni will.
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
          Este heartbeat acredita contacto sin inventar una medición. El
          firmware debe generar un UUID distinto para cada mensaje.
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
      </details>
      <button className="button secondary" onClick={close}>
        Listo
      </button>
    </Dialog>
  );
}
