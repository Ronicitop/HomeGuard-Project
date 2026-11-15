import { eventFromNotification } from "../domain";
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path, "homeguard://");
    const id = eventFromNotification({
      event_id: url.pathname.split("/").filter(Boolean).pop(),
    });
    if (url.hostname === "events" && id) return "/?view=event&id=" + id;
    return "/";
  } catch {
    return "/";
  }
}
