import { lazy, Suspense } from "react";
import type { ComponentType } from "react";
import { Camera, Users, Footprints, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { PageTitle, Panel, Empty, Loading } from "../shared/ui";
const imports = import.meta.glob([
  "../features/cameras/CamerasPage.tsx",
  "../features/people/PeoplePage.tsx",
  "../features/movements/MovementsPage.tsx",
]);
const definitions = {
  cameras: {
    title: "Cámaras",
    description: "Todos los espacios, desde una sola vista.",
    file: "CamerasPage",
    icon: Camera,
  },
  people: {
    title: "Personas",
    description: "Organizá tus perfiles y los encuentros registrados.",
    file: "PeoplePage",
    icon: Users,
  },
  movements: {
    title: "Movimientos",
    description: "Elegí qué actividad querés observar y cómo recibir avisos.",
    file: "MovementsPage",
    icon: Footprints,
  },
};
const loaded: Partial<Record<keyof typeof definitions, ComponentType>> = {};
for (const [key, value] of Object.entries(definitions)) {
  const loader = imports[`../features/${key}/${value.file}.tsx`];
  if (loader)
    loaded[key as keyof typeof definitions] = lazy(async () => {
      const module = (await loader()) as Record<string, ComponentType>;
      return { default: module[value.file] || module.default };
    });
}
export function IntegrationPage({ kind }: { kind: keyof typeof definitions }) {
  const d = definitions[kind],
    Component = loaded[kind];
  if (Component)
    return (
      <Suspense fallback={<Loading />}>
        <Component />
      </Suspense>
    );
  return (
    <>
      <PageTitle
        eyebrow="MI HOGAR"
        title={d.title}
        description={d.description}
      />
      <Panel>
        <Empty
          icon={<d.icon size={34} />}
          title="Servicio pendiente de conexión"
          description="Esta sección estará disponible cuando se conecte su servicio. Podés continuar revisando el historial y la configuración del hogar."
          action={
            <Link className="button secondary" to="/settings">
              <WifiOff size={16} />
              Consultar estado de servicios
            </Link>
          }
        />
      </Panel>
    </>
  );
}
