import Cameras from "../../Cameras";
import { useSession } from "../../app/SessionProvider";
export function CamerasPage() {
  const { user } = useSession();
  return <Cameras admin={user?.rol === "ADMINISTRADOR"} />;
}
