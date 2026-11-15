import { useSearchParams } from "react-router-dom";
import { ListFilter, Search, Inbox } from "lucide-react";
import { useState } from "react";
import { useResource } from "../../shared/useResource";
import type { EventView, Page } from "../../shared/models";
import {
  PageTitle,
  Panel,
  Empty,
  ResourceError,
  Loading,
} from "../../shared/ui";
import { EventList } from "./EventList";
export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const [cursor, setCursor] = useState<string | null>(null);
  const query = new URLSearchParams(params);
  if (cursor) query.set("cursor", cursor);
  query.set("limit", "20");
  const resource = useResource<Page<EventView>>(`/events?${query}`, 15000);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setCursor(null);
    setParams(next);
  }
  return (
    <>
      <PageTitle
        eyebrow="TU HISTORIAL"
        title="Cada evento, en contexto"
        description="Revisá la actividad de tu hogar y decidí qué necesita atención."
      />
      <Panel>
        <div className="filter-bar">
          <div className="input-icon search-filter">
            <Search size={18} />
            <input
              aria-label="Buscar eventos"
              placeholder="Buscar en el historial…"
              value={params.get("search") || ""}
              onChange={(e) => filter("search", e.target.value)}
            />
          </div>
          <ListFilter size={17} className="muted" />
          <select
            aria-label="Categoría"
            value={params.get("category") || ""}
            onChange={(e) => filter("category", e.target.value)}
          >
            <option value="">Todas las categorías</option>
            <option value="SECURITY">Seguridad</option>
            <option value="MOVEMENT">Movimientos</option>
            <option value="EMERGENCY">Emergencias</option>
            <option value="SYSTEM">Sistema</option>
          </select>
          <select
            aria-label="Estado"
            value={params.get("status") || ""}
            onChange={(e) => filter("status", e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="NEW">Nuevos</option>
            <option value="ACKNOWLEDGED">Revisados</option>
            <option value="RESOLVED">Resueltos</option>
            <option value="FALSE_POSITIVE">Falsas alarmas</option>
          </select>
          <select
            aria-label="Origen"
            value={params.get("source") || ""}
            onChange={(e) => filter("source", e.target.value)}
          >
            <option value="">Todos los orígenes</option>
            <option value="LIVE">En vivo</option>
            <option value="REPLAY">Grabación</option>
            <option value="SIMULATED">Simulación</option>
          </select>
        </div>
        {resource.error ? (
          <ResourceError message={resource.error} retry={resource.reload} />
        ) : resource.loading && !resource.data ? (
          <Loading />
        ) : resource.data?.items.length ? (
          <EventList items={resource.data.items} />
        ) : (
          <Empty
            icon={<Inbox size={30} />}
            title="No hay eventos para mostrar"
            description="La actividad aparecerá aquí cuando se registre. También podés cambiar los filtros."
          />
        )}
        <div className="pagination">
          <button
            className="button secondary"
            disabled={!cursor}
            onClick={() => setCursor(null)}
          >
            Primera página
          </button>
          <span className="muted text-small">
            {resource.data?.items.length || 0} eventos en esta página
          </span>
          <button
            className="button secondary"
            disabled={!resource.data?.next_cursor}
            onClick={() => setCursor(resource.data!.next_cursor)}
          >
            Siguiente página
          </button>
        </div>
      </Panel>
    </>
  );
}
