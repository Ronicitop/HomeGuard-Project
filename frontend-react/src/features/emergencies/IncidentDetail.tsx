import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCheck, HeartPulse, Headphones } from "lucide-react";
import { useResource } from "../../shared/useResource";
import type { IncidentView } from "../../shared/models";
import { api, errorMessage, refreshData } from "../../shared/api";
import {
  Panel,
  PageTitle,
  Badge,
  Notice,
  Loading,
  ResourceError,
  dateTime,
} from "../../shared/ui";
export function IncidentDetail() {
  const { id } = useParams();
  const r = useResource<IncidentView>(`/emergencies/${id}`, 3000);
  const [now, setNow] = useState(() => Date.now()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function respond(response: string) {
    if (!r.data) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/emergencies/${id}/respond`, {
        response,
        expected_revision: r.data.state_revision,
      });
      refreshData();
    } catch (e) {
      setError(errorMessage(e));
      r.reload();
    } finally {
      setBusy(false);
    }
  }
  if (r.error) return <ResourceError message={r.error} retry={r.reload} />;
  if (!r.data) return <Loading />;
  const i = r.data,
    remaining = Math.max(
      0,
      Math.ceil((Date.parse(i.response_deadline) - now) / 1000),
    ),
    canRespond = !["CANCELLED", "CLOSED", "FAILED"].includes(i.state);
  return (
    <>
      <Link to="/emergencies" className="back-link">
        <ArrowLeft size={16} />
        Volver a emergencias
      </Link>
      <PageTitle
        eyebrow="RESPUESTA AL INCIDENTE"
        title="Posible caída"
        description={`Abierto el ${dateTime(i.created_at)} · Central de demostración`}
      />
      <Badge value={i.state} />
      {error && <Notice tone="error">{error}</Notice>}
      <Panel className="response-panel">
        <span className="response-icon">
          <HeartPulse size={36} />
        </span>
        <h2>
          {i.state === "PENDING_RESPONSE"
            ? "¿Está todo bien?"
            : "Estado de la respuesta"}
        </h2>
        <p className="muted">
          {i.state === "PENDING_RESPONSE"
            ? "Confirmá tu estado antes de que finalice el plazo de práctica."
            : "Consultá la respuesta registrada. Todas las llamadas de esta versión son simuladas."}
        </p>
        {i.state === "PENDING_RESPONSE" && (
          <div className="countdown">
            <strong>{remaining}</strong>
            <span>segundos para responder</span>
          </div>
        )}
        {i.cancellation_requested && (
          <Notice>
            Se informó al operador que solicitaste cancelar la atención.
          </Notice>
        )}
        {canRespond && (
          <div className="response-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void respond("I_AM_OK")}
            >
              <CheckCheck size={19} />
              Estoy bien
            </button>
            {["PENDING_RESPONSE", "NEEDS_REVIEW"].includes(i.state) && (
              <button
                className="button danger"
                disabled={busy}
                onClick={() => void respond("REQUEST_HELP")}
              >
                <Headphones size={19} />
                Solicitar ayuda simulada
              </button>
            )}
          </div>
        )}
        <p className="muted text-small">
          La cuenta regresiva es orientativa. El estado confirmado por el
          servidor determina la transición.
        </p>
      </Panel>
      <Panel title="Historial y evidencia">
        <Link className="text-button" to={`/events/${i.event_id}`}>
          Abrir el evento asociado
        </Link>
      </Panel>
    </>
  );
}
