import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  HeartPulse,
  ArrowRight,
  FlaskConical,
  Save,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "../../app/SessionProvider";
import { useResource } from "../../shared/useResource";
import { api, errorMessage, refreshData } from "../../shared/api";
import type {
  IncidentView,
  Page,
  EmergencyProfile,
  EmergencyPolicy,
} from "../../shared/models";
import {
  PageTitle,
  Panel,
  Notice,
  Badge,
  Empty,
  ResourceError,
  dateTime,
} from "../../shared/ui";
const emptyProfile: EmergencyProfile = {
  contact_name: "",
  address: "",
  access_notes: "",
  contacts: [],
  fictitious_data_confirmed: false,
  revision: 0,
};
export function EmergenciesPage() {
  const { user } = useSession(),
    admin = user?.rol === "ADMINISTRADOR";
  const incidents = useResource<Page<IncidentView>>("/emergencies", 5000),
    policy = useResource<EmergencyPolicy>("/emergency-policy", 0),
    profile = useResource<EmergencyProfile>("/emergency-profile", 0, admin);
  const [draftOverride, setDraft] = useState<EmergencyProfile | null>(null),
    [policyOverride, setPolicyDraft] = useState<EmergencyPolicy | null>(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const draft =
    draftOverride && draftOverride.revision === (profile.data?.revision || 0)
      ? draftOverride
      : profile.data || emptyProfile;
  const policyDraft: EmergencyPolicy =
    policyOverride && policyOverride.revision === (policy.data?.revision || 0)
      ? policyOverride
      : policy.data || {
          enabled: false,
          immobility_seconds: 10,
          response_seconds: 20,
          transport: "SIMULATED",
          revision: 0,
        };
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy("profile");
    setError("");
    try {
      const { revision, ...data } = draft;
      await api.put("/emergency-profile", {
        ...data,
        expected_revision: revision,
      });
      setMessage("Perfil de demostración guardado.");
      refreshData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  async function savePolicy(e: FormEvent) {
    e.preventDefault();
    setBusy("policy");
    setError("");
    try {
      await api.put("/emergency-policy", {
        enabled: policyDraft.enabled,
        immobility_seconds: Number(policyDraft.immobility_seconds),
        response_seconds: Number(policyDraft.response_seconds),
        transport: "SIMULATED",
        expected_revision: policyDraft.revision,
      });
      setMessage("Política de emergencia guardada.");
      refreshData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  async function simulate() {
    setBusy("demo");
    setError("");
    try {
      await api.post("/demo/events", {
        scenario: "POSSIBLE_FALL",
        notify_enabled: true,
        save_clip_enabled: false,
      });
      setMessage(
        "Posible caída simulada registrada. El servidor revisará la política de respuesta.",
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
        eyebrow="CUIDADO Y RESPUESTA"
        title="Emergencias"
        description="Revisá incidentes y configurá cómo responder en una situación de prueba."
        action={
          admin && (
            <button
              className="button secondary"
              disabled={Boolean(busy) || !policy.data?.enabled}
              onClick={() => void simulate()}
            >
              <FlaskConical size={17} />
              Simular posible caída
            </button>
          )
        }
      />
      <Notice>
        Esta versión utiliza una central simulada. No llama a servicios de
        emergencia reales. Una posible caída es una observación, no un
        diagnóstico médico.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <Panel
        title="Incidentes recientes"
        description="Los plazos y las transiciones se mantienen en el servidor."
      >
        {incidents.error ? (
          <ResourceError message={incidents.error} retry={incidents.reload} />
        ) : incidents.data?.items.length ? (
          <div className="incident-list">
            {incidents.data.items.map((i) => (
              <Link
                to={`/emergencies/${i.id}`}
                className="incident-row"
                key={i.id}
              >
                <span className="event-icon event-icon-emergency">
                  <HeartPulse size={21} />
                </span>
                <div>
                  <strong>Posible caída · Demostración</strong>
                  <p className="muted text-small">{dateTime(i.created_at)}</p>
                </div>
                <Badge value={i.state} />
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            icon={<ShieldCheck size={30} />}
            title="Sin incidentes registrados"
            description="Si se abre una emergencia, vas a poder revisar su estado y responder desde aquí."
          />
        )}
      </Panel>
      {admin && (
        <div className="equal-columns">
          <Panel
            title="Perfil de demostración"
            description="Usá datos ficticios para la presentación universitaria."
          >
            <form onSubmit={saveProfile} className="stack">
              <label>
                Nombre del responsable de prueba
                <input
                  required
                  maxLength={100}
                  value={draft.contact_name}
                  onChange={(e) =>
                    setDraft({ ...draft, contact_name: e.target.value })
                  }
                />
              </label>
              <label>
                Dirección ficticia
                <div className="input-icon">
                  <MapPin size={17} />
                  <input
                    required
                    minLength={5}
                    maxLength={300}
                    value={draft.address}
                    onChange={(e) =>
                      setDraft({ ...draft, address: e.target.value })
                    }
                  />
                </div>
              </label>
              <label>
                Referencias de acceso
                <textarea
                  maxLength={500}
                  value={draft.access_notes}
                  onChange={(e) =>
                    setDraft({ ...draft, access_notes: e.target.value })
                  }
                />
              </label>
              <label>
                Contacto de prueba
                <input
                  placeholder="Ejemplo: Contacto del aula"
                  value={draft.contacts[0]?.name || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      contacts: [
                        {
                          name: e.target.value,
                          phone: draft.contacts[0]?.phone || "DEMO-001",
                        },
                      ],
                    })
                  }
                />
              </label>
              <label>
                Identificador del contacto
                <input
                  placeholder="DEMO-001"
                  value={draft.contacts[0]?.phone || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      contacts: [
                        {
                          name: draft.contacts[0]?.name || "Contacto de prueba",
                          phone: e.target.value,
                        },
                      ],
                    })
                  }
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.fictitious_data_confirmed}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      fictitious_data_confirmed: e.target.checked,
                    })
                  }
                />
                Confirmo que estos datos son ficticios y corresponden a una
                demostración.
              </label>
              <button
                className="button primary"
                disabled={Boolean(busy) || !draft.fictitious_data_confirmed}
              >
                <Save size={16} />
                {busy === "profile" ? "Guardando…" : "Guardar perfil"}
              </button>
            </form>
          </Panel>
          <Panel
            title="Política de respuesta"
            description="Parámetros de práctica, configurables y sin uso clínico."
          >
            <form className="stack" onSubmit={savePolicy}>
              <label className="toggle-row">
                <span>
                  <strong>Escalamiento simulado</strong>
                  <small>Abrir una llamada en la central de práctica</small>
                </span>
                <input
                  role="switch"
                  type="checkbox"
                  checked={policyDraft.enabled}
                  onChange={(e) =>
                    setPolicyDraft({
                      ...policyDraft,
                      enabled: e.target.checked,
                    })
                  }
                />
              </label>
              <label>
                Inmovilidad observada (segundos)
                <input
                  type="number"
                  min={5}
                  max={120}
                  required
                  value={policyDraft.immobility_seconds}
                  onChange={(e) =>
                    setPolicyDraft({
                      ...policyDraft,
                      immobility_seconds: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Plazo para responder (segundos)
                <input
                  type="number"
                  min={10}
                  max={300}
                  required
                  value={policyDraft.response_seconds}
                  onChange={(e) =>
                    setPolicyDraft({
                      ...policyDraft,
                      response_seconds: Number(e.target.value),
                    })
                  }
                />
              </label>
              <Notice>
                Primero guardá un perfil ficticio confirmado. Cambiar los
                umbrales requiere revisar las reglas visuales que los utilizan.
              </Notice>
              <button className="button primary" disabled={Boolean(busy)}>
                <Save size={16} />
                {busy === "policy" ? "Guardando…" : "Guardar política"}
              </button>
              <p className="muted text-small">
                Si el servidor reinicia con un plazo vencido, el incidente
                requiere revisión. No se origina una llamada histórica
                automática.
              </p>
            </form>
          </Panel>
        </div>
      )}
    </>
  );
}
