import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { lease, connectRTC, webcamSource } from "./surveillance";
import { cameraRequest } from "./shared/api";
import "./Cameras.css";
const featureLabels = {
  people: "Personas",
  faces: "Reconocimiento facial",
  pets: "Mascotas",
  motion: "Movimiento",
  posture: "Postura",
};
type Feature = keyof typeof featureLabels;
type Camera = {
  detection_settings?: Record<Feature, boolean>;
  detection_revision?: number;
  id: number;
  nombre: string;
  conectada?: boolean;
  webcam_device_id?: string | null;
};
type Result = {
  revision?: number;
  status: string;
  generation?: string;
  sequence?: number;
  at?: number;
  durationMs?: number;
  incompatibleProfiles?: string[];
  enrollment?: { count: number; status: string };
  detections: { category: string; label: string; box: number[] }[];
};
async function api<T = unknown>(url: string, data?: object, method = "POST") {
  return cameraRequest<T>(
    url.replace(/^\/api/, ""),
    data ? method : "GET",
    data,
  );
}
const labels: Record<string, string> = {
  live: "Análisis activo en el servidor",
  degraded: "Análisis parcialmente disponible",
  connecting: "Conectando con el análisis",
  starting: "Cargando modelos en el servidor",
  disconnected: "Cámara desconectada",
  unavailable: "Análisis no disponible",
};
export default function Cameras({ admin }: { admin: boolean }) {
  const [saving, setSaving] = useState(false);
  const [params] = useSearchParams();
  const [view, setView] = useState<"remote" | "publish" | "local">("remote"),
    [cameras, setCameras] = useState<Camera[]>([]),
    [camera, setCamera] = useState(Number(params.get("camera")) || 0),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState<string | undefined>(undefined),
    [front, setFront] = useState(false),
    [active, setActive] = useState(false),
    [connected, setConnected] = useState(false),
    [message, setMessage] = useState("Selecciona una cámara para comenzar."),
    [name, setName] = useState(""),
    [consent, setConsent] = useState(false),
    [result, setResult] = useState<Result>({
      status: "disconnected",
      detections: [],
    }),
    [profiles, setProfiles] = useState<{ id: number; nombre: string }[]>([]),
    [events, setEvents] = useState<
      { id: number; fecha: string; categoria: string; nombre?: string }[]
    >([]),
    [page, setPage] = useState(1);
  const [publication, setPublication] = useState(""),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(clock);
  }, []);
  const video = useRef<HTMLVideoElement>(null),
    cleanup = useRef(() => {}),
    generation = useRef(0),
    retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    want = useRef(false),
    startRef = useRef<() => void>(() => {});
  const refresh = useCallback(
    (n = page) =>
      Promise.all([
        api<{
          cameras: Camera[];
          profiles: { id: number; nombre: string }[];
          events: {
            id: number;
            fecha: string;
            categoria: string;
            nombre?: string;
          }[];
        }>("/api/vision?page=" + n),
        api<Camera[]>("/api/streams"),
      ]).then(([d, c]) => {
        setCameras((previous) => c.map((item) => {
          const known = previous.find(cam => cam.id === item.id);
          return {
            ...item,
            ...(known && (known.detection_revision ?? 0) > (item.detection_revision ?? 0)
              ? { detection_revision: known.detection_revision, detection_settings: known.detection_settings }
              : {}),
            webcam_device_id: d.cameras.find(cam => cam.id === item.id)?.webcam_device_id,
          };
        }));
        setProfiles(d.profiles);
        setEvents(d.events);
        setCamera((v) => v || d.cameras[0]?.id || 0);
      }),
    [page],
  );
  function stop() {
    setPublication("");
    setConnected(false);
    want.current = false;
    clearTimeout(retry.current);
    generation.current++;
    cleanup.current();
    cleanup.current = () => {};
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setResult({ status: "disconnected", detections: [] });
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
    const t = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => {});
    }, 3000);
    return () => {
      clearInterval(t);
    };
  }, [refresh]);
  useEffect(
    () => () => {
      want.current = false;
      clearTimeout(retry.current);
      generation.current++;
      cleanup.current();
    },
    [],
  );
  useEffect(() => {
    if (!camera || view === "publish") return;
    const source = new EventSource("/api/analysis?cameraId=" + camera);
    source.onmessage = (e) => {
      const r = JSON.parse(e.data) as Result;
      setResult(r);
    };
    source.onerror = () => setResult({ status: "unavailable", detections: [] });
    const t = setInterval(
      () =>
        setResult((r) =>
          r.at && Date.now() - r.at > 5000
            ? { ...r, status: "unavailable", detections: [] }
            : r,
        ),
      500,
    );
    return () => {
      source.close();
      clearInterval(t);
    };
  }, [camera, view]);
  async function start() {
    stop();
    want.current = true;
    const gen = generation.current;
    setActive(true);
    setMessage("Conectando…");
    const releases: (() => void)[] = [];
    const release = () => {
      releases
        .splice(0)
        .reverse()
        .forEach((f) => f());
    };
    cleanup.current = release;
    const lost = () => {
      if (gen !== generation.current) return;
      const again = view === "remote" && want.current;
      stop();
      setMessage("Conexión interrumpida");
      if (again) {
        want.current = true;
        retry.current = setTimeout(() => {
          if (want.current) startRef.current();
        }, 3000);
      }
    };
    try {
      if (!window.isSecureContext || !navigator.mediaDevices)
        throw Error("Abre HomeGuard mediante HTTPS para utilizar cámaras.");
      const l = await lease(
        camera,
        view === "remote" ? "view" : "publish",
        true,
        lost,
      );
      setPublication(l.generation);
      releases.push(() => l.close());
      if (gen !== generation.current) {
        release();
        return;
      }
      let media: MediaStream;
      let screenWarning = "";
      if (view === "remote") {
        const rtc = await connectRTC(l.path, l.token, null, lost);
        releases.push(() => rtc.close());
        media = rtc.stream;
      } else {
        media = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(view === "local"
              ? webcamSource(
                  device,
                  cameras.find((c) => c.id === camera)?.webcam_device_id,
                )
              : { facingMode: front ? "user" : "environment" }),
            width: { ideal: 640, max: 640 },
            height: { ideal: 480, max: 480 },
            frameRate: { ideal: 15, max: 15 },
          },
          audio: false,
        });
        releases.push(() => media.getTracks().forEach((t) => t.stop()));
        if (gen !== generation.current) {
          release();
          return;
        }
        const rtc = await connectRTC(l.path, l.token, media, lost);
        releases.push(() => rtc.close());
        try {
          const wake = await navigator.wakeLock.request("screen");
          releases.push(() => {
            void wake.release();
          });
        } catch {
          screenWarning =
            " No se pudo mantener la pantalla activa automáticamente; hazlo manualmente.";
        }
      }
      if (gen !== generation.current) {
        release();
        return;
      }
      video.current!.srcObject = media;
      await video.current!.play();
      setConnected(true);
      media
        .getVideoTracks()[0]
        ?.addEventListener("ended", lost, { once: true });
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput",
        ),
      );
      setMessage(
        view === "remote"
          ? "Video en vivo. El servidor realiza el reconocimiento."
          : "Transmitiendo al servidor. Mantén esta página abierta y la pantalla activa." +
              screenWarning,
      );
    } catch (e) {
      release();
      if (gen !== generation.current) return;
      lost();
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    startRef.current = () => {
      void start();
    };
  });
  const selected = cameras.find((c) => c.id === camera);
  const live =
    result.revision === selected?.detection_revision &&
    result.generation === publication &&
    result.at &&
    now - result.at < 5000 &&
    ["live", "degraded"].includes(result.status);
  async function action(body: object) {
    try {
      await api("/api/analysis", body);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="cameras">
      <div className="camera-heading">
        <div>
          <span className="eyebrow">SEGURIDAD EN TIEMPO REAL</span>
          <h2>Cámaras</h2>
          <p>Video en vivo y reconocimiento en el servidor. Sin grabaciones.</p>
        </div>
        <span className={"badge " + (active ? "success" : "")}>
          {active ? (connected ? "En vivo" : "Conectando") : "Desconectada"}
        </span>
      </div>
      <nav className="camera-tabs" aria-label="Modo de cámara">
        {(["remote", "publish", "local"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            onClick={() => {
              stop();
              setView(v);
            }}
          >
            {v === "remote"
              ? "Panel de vigilancia"
              : v === "publish"
                ? "Transmitir"
                : "Webcam"}
          </button>
        ))}
      </nav>
      <div className="camera-layout">
        <section className="card camera-main">
          <div className="camera-toolbar">
            <label>
              Cámara registrada
              <select
                value={camera}
                disabled={active}
                onChange={(e) => {
                  stop();
                  setCamera(+e.target.value);
                  setDevice(undefined);
                }}
              >
                <option value={0}>Selecciona una cámara</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.conectada ? " · En línea" : ""}
                  </option>
                ))}
              </select>
            </label>
            {view !== "remote" && (
              <label>
                Origen
                <select
                  disabled={active}
                  value={
                    view === "local"
                      ? (device ??
                        cameras.find((c) => c.id === camera)
                          ?.webcam_device_id ??
                        "")
                      : front
                        ? "front"
                        : "back"
                  }
                  onChange={(e) =>
                    view === "local"
                      ? setDevice(e.target.value)
                      : setFront(e.target.value === "front")
                  }
                >
                  {view === "local" ? (
                    <>
                      <option value="">Cámara predeterminada</option>
                      {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || "Webcam"}
                        </option>
                      ))}
                    </>
                  ) : (
                    <>
                      <option value="back">Cámara trasera</option>
                      <option value="front">Cámara frontal</option>
                    </>
                  )}
                </select>
              </label>
            )}
          </div>
          {selected?.detection_settings && (
            <fieldset disabled={!admin || saving}>
              <legend>Detecciones de esta cámara</legend>
              {(Object.keys(featureLabels) as Feature[]).map((feature) => (
                <label
                  key={feature}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.detection_settings![feature]}
                    onChange={async (e) => {
                      setSaving(true);
                      try {
                        const update = await api<
                          Pick<
                            Camera,
                            "detection_settings" | "detection_revision"
                          >
                        >("/api/camera-settings", {
                          cameraId: camera,
                          feature,
                          enabled: e.target.checked,
                        });
                        setCameras((list) =>
                          list.map((c) =>
                            c.id === camera && (update.detection_revision ?? 0) >= (c.detection_revision ?? 0) ? { ...c, ...update } : c,
                          ),
                        );
                      } catch (error) {
                        setMessage((error as Error).message);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  />
                  {featureLabels[feature]}
                </label>
              ))}
            </fieldset>
          )}
          <div className="video-stage">
            <div className="video-frame">
              <video ref={video} muted playsInline />
              {active && view !== "publish" && live && (
                <svg
                  className="detection-layer"
                  viewBox="0 0 640 480"
                  preserveAspectRatio="none"
                  aria-label="Detecciones"
                >
                  {result.detections.map((d, i) => {
                    const [x, y, w, h] = d.box;
                    return (
                      <g
                        key={i}
                        className={d.category === "unknown" ? "unknown" : ""}
                      >
                        <rect
                          x={x * 640}
                          y={y * 480}
                          width={w * 640}
                          height={h * 480}
                        />
                        <text
                          x={Math.min(x * 640, 420)}
                          y={Math.max(20, y * 480 - 6)}
                        >
                          {d.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
            {!active && (
              <div className="video-empty">
                <strong>
                  {view === "remote"
                    ? "Panel de vigilancia"
                    : "Tu cámara, conectada a HomeGuard"}
                </strong>
                <span>
                  {view === "remote"
                    ? "Inicia la transmisión en el celular y conecta este panel."
                    : "El video se enviará al servidor para analizarlo."}
                </span>
              </div>
            )}
          </div>
          <div className="camera-actions">
            <button
              className="primary"
              disabled={active || !camera}
              onClick={() => void start()}
            >
              {view === "remote" ? "Conectar panel" : "Iniciar transmisión"}
            </button>
            <button
              disabled={!active}
              onClick={() => {
                stop();
                setMessage("Conexión detenida.");
              }}
            >
              Detener
            </button>
          </div>
          <p role="status" className="notice">
            {message}
          </p>
          {view !== "publish" && (
            <p
              className={
                "analysis-status " +
                (result.status === "degraded" ? "warning" : "")
              }
            >
              {selected?.detection_settings &&
              !Object.values(selected.detection_settings).some(Boolean)
                ? "Solo video · análisis apagado"
                : labels[result.status] || result.status}
              {result.durationMs ? " · " + result.durationMs + " ms" : ""}
            </p>
          )}
          {!!result.incompatibleProfiles?.length && (
            <p className="notice warning">
              Se requiere volver a registrar:{" "}
              {result.incompatibleProfiles.join(", ")}
            </p>
          )}
        </section>
        <aside className="camera-side">
          <section className="card">
            <h3>Equipos conectados</h3>
            <p>Registrá, configurá o eliminá las cámaras en Conexiones.</p>
            <Link className="button secondary" to="/connections">
              Abrir Conexiones
            </Link>
          </section>
          {admin && view !== "publish" && (
            <section className="card">
              <h3>Registrar residente</h3>
              <p>
                La persona debe mostrar su rostro al dispositivo que transmite.
              </p>
              <label>
                Nombre
                <input
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                La persona acepta registrar su perfil facial.
              </label>
              <button
                className="primary"
                disabled={
                  !selected?.detection_settings?.faces ||
                  !consent ||
                  !name.trim() ||
                  !live
                }
                onClick={() =>
                  void action({
                    action: "enroll",
                    cameraId: camera,
                    name,
                    consent,
                  })
                }
              >
                Capturar cinco muestras
              </button>
              <p role="status">
                {result.enrollment?.status === "saved"
                  ? "Perfil guardado"
                  : result.enrollment?.status === "expired"
                    ? "Captura vencida. Inténtalo de nuevo."
                    : (result.enrollment?.count || 0) + "/5 muestras"}
              </p>
              <button
                onClick={() =>
                  void action({ action: "cancel", cameraId: camera })
                }
              >
                Cancelar captura
              </button>
              <ul className="profile-list">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <span>{p.nombre}</span>
                    <button
                      onClick={async () => {
                        try {
                          await api("/api/vision", { id: p.id }, "DELETE");
                          await refresh();
                        } catch (e) {
                          setMessage((e as Error).message);
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <h3>Cómo funciona</h3>
            <p>
              El análisis continúa mientras la cámara transmita, incluso si
              cierras este panel. Mantén el celular con la pantalla activa.
            </p>
            <p>El reconocimiento es informativo. No desarma la vivienda.</p>
          </section>
        </aside>
      </div>
      <section className="card">
        <div className="camera-heading">
          <h3>Eventos · últimos 30 días</h3>
          <button
            onClick={() => void refresh().catch((e) => setMessage(e.message))}
          >
            Actualizar
          </button>
        </div>
        {events.length ? (
          <ul className="event-list">
            {events.map((e) => (
              <li key={e.id}>
                <span
                  className={
                    "badge " + (e.categoria === "unknown" ? "warning" : "")
                  }
                >
                  {{
                    resident: "Residente",
                    unknown: "Rostro desconocido",
                    person: "Persona sin identificar",
                    cat: "Gato",
                    dog: "Perro",
                    motion: "Movimiento",
                    standing: "Persona de pie",
                    sitting: "Persona sentada",
                  }[e.categoria] || e.categoria}
                </span>
                <span>{e.nombre}</span>
                <time>{new Date(e.fecha).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">
            No hay eventos registrados en esta página.
          </p>
        )}
        <div className="camera-actions">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>Página {page}</span>
          <button
            disabled={events.length < 25}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      </section>
    </div>
  );
}
