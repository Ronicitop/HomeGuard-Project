import { useState } from "react";
import type { FormEvent } from "react";
import { Save, Plus, Server, Bell, RefreshCw, Smartphone } from "lucide-react";
import { useSession } from "../../app/SessionProvider";
import { useResource } from "../../shared/useResource";
import type { Health, Member, Page, Preferences } from "../../shared/models";
import { api, errorMessage, refreshData } from "../../shared/api";
import {
  PageTitle,
  Panel,
  Notice,
  Badge,
  ResourceError,
} from "../../shared/ui";
const defaults: Preferences = {
  categories: ["SECURITY", "MOVEMENT", "EMERGENCY", "SYSTEM"],
  quiet_start: null,
  quiet_end: null,
  critical_demo_override: false,
  revision: 0,
};
export function SettingsPage() {
  const { user } = useSession(),
    admin = user?.rol === "ADMINISTRADOR";
  const health = useResource<Health>("/health", 15000),
    members = useResource<Page<Member>>("/members", 0, admin),
    preferences = useResource<Preferences>("/notification-preferences");
  const devices =
    useResource<
      Page<{ installation_id: string; enabled: boolean; platform: string }>
    >("/push-devices");
  const [prefsOverride, setPrefs] = useState<Preferences|null>(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [member, setMember] = useState({
    nombre: "",
    apellido: "",
    email: "",
    password: "",
    role: "RESIDENTE",
  });
  const prefs=prefsOverride&&prefsOverride.revision===(preferences.data?.revision||0)?prefsOverride:preferences.data||defaults;
  async function savePreferences(e: FormEvent) {
    e.preventDefault();
    setBusy("preferences");
    setError("");
    try {
      const { revision, ...data } = prefs;
      await api.patch("/notification-preferences", {
        ...data,
        expected_revision: revision,
      });
      setMessage("Preferencias guardadas.");
      refreshData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  async function addMember(e: FormEvent) {
    e.preventDefault();
    setBusy("member");
    setError("");
    try {
      await api.post("/members", member);
      setMember({
        nombre: "",
        apellido: "",
        email: "",
        password: "",
        role: "RESIDENTE",
      });
      setMessage("Miembro registrado. Ya puede iniciar sesión.");
      refreshData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  async function updateMember(m: Member, role: string, enabled: boolean) {
    if (
      !enabled &&
      !window.confirm(
        `¿Desactivar el acceso de ${m.nombre}? Sus sesiones serán revocadas.`,
      )
    )
      return;
    setBusy(String(m.id));
    setError("");
    try {
      await api.patch(`/members/${m.id}`, {
        role,
        enabled,
        expected_revision: m.revision,
      });
      setMessage(
        "Permisos actualizados. Las sesiones anteriores fueron revocadas.",
      );
      refreshData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="TU ESPACIO, A TU MANERA"
        title="Configuración"
        description="Administrá el acceso, los avisos y el estado de los servicios."
      />
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="equal-columns">
        <Panel
          title="Avisos y horarios"
          description="Estas preferencias se aplican a tu cuenta."
        >
          <form onSubmit={savePreferences} className="stack">
            <div className="preference-options">
              {[
                ["SECURITY", "Seguridad"],
                ["MOVEMENT", "Movimientos"],
                ["EMERGENCY", "Emergencias"],
                ["SYSTEM", "Sistema"],
              ].map(([value, label]) => (
                <label className="checkbox-label" key={value}>
                  <input
                    type="checkbox"
                    checked={prefs.categories.includes(value)}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        categories: e.target.checked
                          ? [...prefs.categories, value]
                          : prefs.categories.filter((x) => x !== value),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="form-columns">
              <label>
                Silencio desde
                <input
                  type="time"
                  value={prefs.quiet_start || ""}
                  onChange={(e) =>
                    setPrefs({ ...prefs, quiet_start: e.target.value || null })
                  }
                />
              </label>
              <label>
                Silencio hasta
                <input
                  type="time"
                  value={prefs.quiet_end || ""}
                  onChange={(e) =>
                    setPrefs({ ...prefs, quiet_end: e.target.value || null })
                  }
                />
              </label>
            </div>
            <p className="text-small muted">
              Horario de Bolivia. Dejá ambos campos vacíos para no aplicar
              silencio.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={prefs.critical_demo_override}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    critical_demo_override: e.target.checked,
                  })
                }
              />
              Permitir solicitudes de respuesta de emergencias simuladas fuera
              de mis horarios.
            </label>
            <button className="button primary" disabled={Boolean(busy)}>
              <Save size={16} />
              Guardar preferencias
            </button>
          </form>
        </Panel>
        <Panel
          title="Aplicación móvil"
          description="Los avisos se entregan a los dispositivos que vinculaste."
        >
          <div className="mobile-pairing">
            <Smartphone size={34} />
            <strong>
              {devices.data?.items.filter((d) => d.enabled).length || 0}{" "}
              dispositivos activos
            </strong>
            <p>
              Iniciá sesión en la app Android y habilitá las notificaciones para
              vincular tu teléfono.
            </p>
          </div>
          <div className="service-row">
            <span>
              <Bell size={17} />
              Servicio de notificaciones
            </span>
            <span className="text-small muted">
              {health.data?.integrations.push
                ? "Configurado"
                : "Pendiente de configuración"}
            </span>
          </div>
          <p className="text-small muted">
            El teléfono necesita Internet para recibir push. Acceder al
            historial y al video requiere conexión con el servidor del hogar.
          </p>
        </Panel>
      </div>
      <Panel
        title="Estado de servicios"
        description="Un servicio desconectado se informa sin ocultar los eventos guardados."
        action={
          <button
            className="icon-button"
            aria-label="Actualizar estado"
            onClick={health.reload}
          >
            <RefreshCw size={18} />
          </button>
        }
      >
        {health.error ? (
          <ResourceError message={health.error} retry={health.reload} />
        ) : (
          <div className="health-grid">
            <div className="health-card">
              <Server size={22} />
              <strong>Base de datos</strong>
              <Badge value={health.data?.database || "OFFLINE"} />
            </div>
            <div className="health-card">
              <Server size={22} />
              <strong>Procesador de eventos</strong>
              <Badge
                value={
                  health.data?.services.find(
                    (s) => s.name === "event-processor",
                  )?.status || "OFFLINE"
                }
              />
            </div>
            <div className="health-card">
              <Server size={22} />
              <strong>Cámaras y evidencia</strong>
              <Badge
                value={health.data?.integrations.vision ? "ONLINE" : "OFFLINE"}
              />
            </div>
            <div className="health-card">
              <Bell size={22} />
              <strong>Trabajos pendientes</strong>
              <span className="health-number">
                {health.data?.pending_jobs ?? "—"}
              </span>
            </div>
          </div>
        )}
      </Panel>
      {admin && (
        <>
          <Panel
            title="Miembros del hogar"
            description="Los cambios de rol se verifican en el servidor y revocan las sesiones anteriores."
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Miembro</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Acceso</th>
                  </tr>
                </thead>
                <tbody>
                  {members.data?.items.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span className="member-name">
                          <span className="user-avatar">
                            {m.nombre.slice(0, 1)}
                          </span>
                          {m.nombre} {m.apellido}
                        </span>
                      </td>
                      <td>{m.email}</td>
                      <td>
                        <select
                          aria-label={`Rol de ${m.nombre}`}
                          value={m.role}
                          disabled={Boolean(busy)}
                          onChange={(e) =>
                            void updateMember(m, e.target.value, m.enabled)
                          }
                        >
                          <option value="ADMINISTRADOR">Administrador</option>
                          <option value="RESIDENTE">Residente</option>
                          <option value="INVITADO">Invitado</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void updateMember(m, m.role, !m.enabled)
                          }
                        >
                          {m.enabled ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Registrar miembro"
            description="Solo un administrador puede asignar acceso al hogar."
          >
            <form className="member-form" onSubmit={addMember}>
              <label>
                Nombre
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={member.nombre}
                  onChange={(e) =>
                    setMember({ ...member, nombre: e.target.value })
                  }
                />
              </label>
              <label>
                Apellido
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={member.apellido}
                  onChange={(e) =>
                    setMember({ ...member, apellido: e.target.value })
                  }
                />
              </label>
              <label>
                Correo
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={member.email}
                  onChange={(e) =>
                    setMember({ ...member, email: e.target.value })
                  }
                />
              </label>
              <label>
                Contraseña inicial
                <input
                  type="password"
                  minLength={10}
                  required
                  autoComplete="new-password"
                  value={member.password}
                  onChange={(e) =>
                    setMember({ ...member, password: e.target.value })
                  }
                />
              </label>
              <label>
                Rol
                <select
                  value={member.role}
                  onChange={(e) =>
                    setMember({ ...member, role: e.target.value })
                  }
                >
                  <option value="RESIDENTE">Residente</option>
                  <option value="INVITADO">Invitado</option>
                  <option value="ADMINISTRADOR">Administrador</option>
                </select>
              </label>
              <button className="button primary" disabled={Boolean(busy)}>
                <Plus size={17} />
                Registrar
              </button>
            </form>
          </Panel>
        </>
      )}
    </>
  );
}
