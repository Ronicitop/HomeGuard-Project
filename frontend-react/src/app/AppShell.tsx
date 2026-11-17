import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  NavLink,
  Outlet,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  ShieldCheck,
  LayoutDashboard,
  Camera,
  Users,
  Footprints,
  History,
  Shield,
  HeartPulse,
  Headphones,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
  LockKeyhole,
  Plug,
} from "lucide-react";
import { useSession } from "./SessionProvider";
import { API_BASE, refreshData, errorMessage } from "../shared/api";
import { Notice } from "../shared/ui";
const navigation = [
  { path: "/", label: "Resumen", icon: LayoutDashboard },
  { path: "/cameras", label: "Cámaras", icon: Camera },
  { path: "/connections", label: "Conexiones", icon: Plug },
  { path: "/people", label: "Personas", icon: Users },
  { path: "/movements", label: "Movimientos", icon: Footprints },
  { path: "/events", label: "Eventos", icon: History },
  { path: "/security", label: "Seguridad", icon: Shield },
  { path: "/emergencies", label: "Emergencias", icon: HeartPulse },
];
export function AppShell() {
  const { user, signOut } = useSession();
  const navigate = useNavigate(),
    location = useLocation();
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!user || user.rol === "INVITADO" || typeof EventSource === "undefined")
      return;
    const source = new EventSource(`${API_BASE}/stream`, {
      withCredentials: true,
    });
    for (const name of [
      "event.created",
      "event.updated",
      "emergency.updated",
      "notification.updated",
      "health.updated",
      "clip.updated",
      "sync_required",
      "connection.updated",
    ])
      source.addEventListener(name, refreshData);
    return () => source.close();
  }, [user]);

  if (!user) return null;
  const guest = user.rol === "INVITADO",
    admin = user.rol === "ADMINISTRADOR";
  function submit(e: FormEvent) {
    e.preventDefault();
    navigate(`/events?search=${encodeURIComponent(search)}`);
  }
  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Ir al contenido
      </a>
      {menu && (
        <button
          className="drawer-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Link className="brand" to="/">
          <span className="brand-mark">
            <ShieldCheck size={22} />
          </span>
          <span>
            homeguard<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="household-label">
          <span className="household-avatar">H</span>
          <div>
            <strong>Mi hogar</strong>
            <small>Espacio personal</small>
          </div>
          <span className="tiny-dot" />
        </div>
        <span className="nav-label">MI ESPACIO</span>
        <nav aria-label="Navegación principal">
          {navigation
            .filter((n) => !guest || n.path === "/")
            .map((n) => (
              <NavLink
                to={n.path}
                end={n.path === "/"}
                key={n.path}
                onClick={() => setMenu(false)}
              >
                <n.icon size={19} />
                <span>{n.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          {admin && (
            <NavLink to="/operator">
              <Headphones size={19} />
              Central simulada
            </NavLink>
          )}
          {!guest && (
            <NavLink to="/settings">
              <Settings size={19} />
              Configuración
            </NavLink>
          )}
          <div className="sidebar-divider" />
          <div className="session-marker">
            <LockKeyhole size={15} />
            Sesión protegida
          </div>
          <button
            className="logout-button"
            onClick={() =>
              void signOut().catch((e) => setError(errorMessage(e)))
            }
          >
            <LogOut size={18} />
            Salir
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-toggle"
              aria-label={menu ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span className="breadcrumb">
              Mi hogar <span>/</span>{" "}
              <strong>
                {navigation.find((n) =>
                  n.path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(n.path),
                )?.label ||
                  (
                    {
                      "/operator": "Central simulada",
                      "/settings": "Configuración",
                    } as Record<string, string>
                  )[location.pathname] ||
                  "Detalle"}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            {!guest && (
              <form className="header-search" onSubmit={submit}>
                <Search size={16} />
                <input
                  aria-label="Buscar en eventos"
                  placeholder="Buscar eventos…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </form>
            )}
            <span className="demo-pill">
              <span />
              Prototipo universitario
            </span>
            <div className="user-profile">
              <span className="user-avatar">{user.nombre.slice(0, 1)}</span>
              <div>
                <strong>{user.nombre}</strong>
                <small>
                  {admin ? "Administrador" : guest ? "Invitado" : "Residente"}
                </small>
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {error && <Notice tone="error">{error}</Notice>}
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>HomeGuard · Una mirada más tranquila</span>
          <span>Hora de Bolivia · America/La_Paz</span>
        </footer>
      </div>
    </div>
  );
}
