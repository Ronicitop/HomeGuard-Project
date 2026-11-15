export function planNotifications(
  event: any,
  devices: any[],
  now: Date,
  emergencyOverride = false,
): any[] {
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return devices.filter((d) => {
    if (!d.enabled || !["ADMINISTRADOR", "RESIDENTE"].includes(d.role))
      return false;
    if (emergencyOverride) return d.critical_demo_override === true;
    if (
      !event.decisions?.notify_requested ||
      !d.categories?.includes(event.category)
    )
      return false;
    if (d.quiet_start && d.quiet_end) {
      const s = d.quiet_start,
        e = d.quiet_end;
      const quiet = s < e ? clock >= s && clock < e : clock >= s || clock < e;
      if (quiet) return false;
    }
    return true;
  });
}
export function buildPushPayload(token: string, event: any) {
  return {
    to: token,
    title:
      event.source === "LIVE"
        ? "HomeGuard · Nueva actividad"
        : "HomeGuard · Simulación",
    body: "Abrí la aplicación para revisar el evento.",
    data: { event_id: event.id, source: event.source },
    sound: "default",
    channelId: "homeguard-events",
    ttl: 300,
  };
}
