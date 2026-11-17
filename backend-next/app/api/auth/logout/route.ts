import { handleApi } from "../../../../lib/http/router";
export const POST = (request: Request) =>
  handleApi(request, ["auth", "logout"]);
