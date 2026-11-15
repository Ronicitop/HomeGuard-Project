import { legacyEndpoint } from "../../../../lib/http/legacyRoutes";
export const dynamic = "force-dynamic";
function handler(request: Request) {
  return legacyEndpoint(request, "alerts/resolve");
}
export { handler as GET, handler as POST, handler as OPTIONS };
