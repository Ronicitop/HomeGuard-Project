import { useState } from "react";
import { Headphones, PhoneCall, CheckCheck, Volume2 } from "lucide-react";
import { useResource } from "../../shared/useResource";
import type { IncidentView, Page } from "../../shared/models";
import { api, API_BASE, errorMessage, refreshData } from "../../shared/api";
import {
  PageTitle,
  Panel,
  Notice,
  Badge,
  Empty,
  dateTime,
} from "../../shared/ui";
export function OperatorConsole() {
  const list = useResource<Page<IncidentView>>("/emergencies", 3000);
  const [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const detail = useResource<IncidentView>(
    `/emergencies/${selected}`,
    3000,
    Boolean(selected),
  );
  const items =
    list.data?.items.filter((i) =>
      ["CALLING_SIMULATED", "CONNECTED_SIMULATED", "NEEDS_REVIEW"].includes(
        i.state,
      ),
    ) || [];
  async function action(i: IncidentView, action: "accept" | "close") {
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/emergencies/${i.id}/${action === "accept" ? "simulated-call/accept" : "close"}`,
        { expected_revision: i.state_revision },
      );
      setSelected(i.id);
      refreshData();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function speak(text: string) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "es-ES";
      window.speechSynthesis.speak(utterance);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="CONSOLA DE OPERADOR"
        title="Central simulada"
        description="Un espacio de práctica para recibir y atender avisos de HomeGuard."
      />
      <Notice>
        Esta pantalla no representa a un servicio público ni confirma el envío
        de asistencia. Todas las llamadas son de demostración.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="content-columns">
        <Panel
          title="Avisos para atender"
          description={`${items.length} incidentes activos`}
        >
          {items.length ? (
            <div className="operator-list">
              {items.map((i) => (
                <article
                  key={i.id}
                  className={`operator-call ${selected === i.id ? "selected" : ""}`}
                >
                  <span className="event-icon event-icon-emergency">
                    <PhoneCall size={22} />
                  </span>
                  <div>
                    <strong>Posible caída</strong>
                    <p className="muted text-small">{dateTime(i.created_at)}</p>
                    <Badge value={i.state} />
                  </div>
                  <div className="stack">
                    {i.state === "CALLING_SIMULATED" && (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => void action(i, "accept")}
                      >
                        <Headphones size={16} />
                        Aceptar
                      </button>
                    )}
                    <button
                      className="text-button"
                      onClick={() => setSelected(i.id)}
                    >
                      Ver detalle
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Headphones size={32} />}
              title="La central está a la escucha"
              description="Cuando un incidente escale, el aviso aparecerá aquí para ser atendido."
            />
          )}
        </Panel>
        <Panel title="Atención del incidente">
          {detail.data ? (
            <>
              <Badge value={detail.data.state} />
              <h3 className="space-top">Mensaje automatizado</h3>
              <p className="transcript">
                {detail.data.call?.transcript ||
                  "Todavía no hay una llamada asociada a este incidente."}
              </p>
              {detail.data.call?.audio_status === "READY" ? (
                <audio
                  className="wide space-top"
                  controls
                  src={`${API_BASE}/emergencies/${detail.data.id}/simulated-call/audio`}
                />
              ) : (
                detail.data.call?.transcript && (
                  <>
                    <Notice>
                      El archivo de voz todavía no está disponible. Podés
                      consultar el mensaje escrito o usar la voz del navegador.
                    </Notice>
                    <button
                      className="button secondary"
                      onClick={() => speak(detail.data!.call!.transcript)}
                    >
                      <Volume2 size={16} />
                      Leer con voz del navegador
                    </button>
                  </>
                )
              )}
              {detail.data.cancellation_requested && (
                <Notice>
                  El usuario informó que está bien y solicitó cancelar la
                  atención.
                </Notice>
              )}
              {["CONNECTED_SIMULATED", "NEEDS_REVIEW", "FAILED"].includes(
                detail.data.state,
              ) && (
                <button
                  className="button primary wide space-top"
                  disabled={busy}
                  onClick={() => void action(detail.data!, "close")}
                >
                  <CheckCheck size={17} />
                  Cerrar atención simulada
                </button>
              )}
            </>
          ) : (
            <Empty
              icon={<PhoneCall size={28} />}
              title="Seleccioná un aviso"
              description="El detalle y el mensaje del bot estarán disponibles durante la atención."
            />
          )}
        </Panel>
      </div>
    </>
  );
}
