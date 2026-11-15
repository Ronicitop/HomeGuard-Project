import { useState } from "react";
import type { FormEvent } from "react";
import {
  ShieldCheck,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  House,
  Activity,
} from "lucide-react";
import { useSession } from "./SessionProvider";
import { errorMessage } from "../shared/api";
import { Notice } from "../shared/ui";
export function LoginPage() {
  const { signIn, error: serverError } = useSession();
  const [email, setEmail] = useState("admin@homeguard.local"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            <ShieldCheck />
          </span>
          <span>
            homeguard<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="login-message">
          <span className="eyebrow">UN ESPACIO MÁS TRANQUILO</span>
          <h1>
            Tu hogar.
            <br />
            Siempre cerca.
          </h1>
          <p>
            Observá lo importante, revisá cada alerta y mantené el control desde
            un solo lugar.
          </p>
          <div className="login-house">
            <House size={76} strokeWidth={1} />
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="house-status">
              <Activity size={16} />
              Un sistema, toda la información
            </span>
          </div>
        </div>
        <span className="text-small">Proyecto universitario · Bolivia</span>
      </section>
      <section className="login-form-side">
        <div className="login-form-card">
          <span className="login-lock">
            <LockKeyhole size={24} />
          </span>
          <h2>Bienvenido a casa</h2>
          <p className="muted">Ingresá con tu cuenta para acceder al panel.</p>
          <form onSubmit={submit}>
            <label>
              Correo electrónico
              <input
                autoComplete="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Contraseña
              <div className="password-field">
                <input
                  autoComplete="current-password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label={
                    show ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {(error || serverError) && (
              <Notice tone="error">{error || serverError}</Notice>
            )}
            <button className="button primary wide" disabled={busy}>
              {busy ? "Ingresando…" : "Entrar al panel"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-footnote">
            <LockKeyhole size={14} />
            El acceso a tus eventos está protegido por tu sesión.
          </p>
        </div>
      </section>
    </main>
  );
}
