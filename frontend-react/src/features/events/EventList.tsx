import {
  ArrowRight,
  ShieldAlert,
  Footprints,
  TriangleAlert,
  Activity,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { EventView } from "../../shared/models";
import { Badge, dateTime } from "../../shared/ui";
export function EventList({
  items,
  compact = false,
}: {
  items: EventView[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "event-list compact" : "event-list"}>
      {items.map((event) => {
        const Icon =
          event.category === "SECURITY"
            ? ShieldAlert
            : event.category === "EMERGENCY"
              ? TriangleAlert
              : event.category === "MOVEMENT"
                ? Footprints
                : Activity;
        return (
          <Link className="event-row" key={event.id} to={`/events/${event.id}`}>
            <span
              className={`event-icon event-icon-${event.category.toLowerCase()}`}
            >
              <Icon size={20} />
            </span>
            <div className="event-copy">
              <div className="event-title">{event.summary}</div>
              <div className="event-meta">
                <time dateTime={event.occurred_at}>
                  {dateTime(event.occurred_at)}
                </time>
                <span>·</span>
                <span>
                  {event.source === "LIVE"
                    ? "Cámara en vivo"
                    : event.source === "REPLAY"
                      ? "Grabación"
                      : "Evento de demostración"}
                </span>
              </div>
            </div>
            <Badge value={event.status} />
            {!compact && <Badge value={event.severity} />}
            <ArrowRight className="event-arrow" size={17} />
          </Link>
        );
      })}
    </div>
  );
}
