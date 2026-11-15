import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import {
  createApi,
  eventFromNotification,
  incidentResponse,
  serverOrigin,
} from "./src/domain";
import type { Api } from "./src/domain";
import { installationId, registerInstallation } from "./src/push";
import { MediaPlayer } from "./src/MediaPlayer";
import type { UserView, EventView, IncidentView } from "../contracts/types";
type Route = {
  screen:
    | "home"
    | "events"
    | "emergencies"
    | "settings"
    | "cameras"
    | "people"
    | "rules"
    | "event"
    | "incident"
    | "camera";
  id?: string;
};
const stateNames: Record<string, string> = {
  NEW: "Nuevo",
  ACKNOWLEDGED: "Revisado",
  RESOLVED: "Resuelto",
  FALSE_POSITIVE: "Falsa alarma",
  PENDING_RESPONSE: "Esperando respuesta",
  CALLING_SIMULATED: "Central simulada sonando",
  CONNECTED_SIMULATED: "Operador conectado",
  CANCELLED: "Cancelado",
  CLOSED: "Cerrado",
  NEEDS_REVIEW: "Requiere revisión",
  SIMULATED: "Simulado",
  LIVE: "En vivo",
  REPLAY: "Grabación",
  AWAY: "Ausencia",
  HOME: "En casa",
  DISARMED: "Desarmado",
};
function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#174e43" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
function useRemote(path: string, api: Api) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setData(null);
    setError("");
    api(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [path, api, revision]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") setRevision((x) => x + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);
  return { data, error, busy, reload: () => setRevision((x) => x + 1) };
}
export default function App() {
  const [origin, setOrigin] = useState(
      process.env.EXPO_PUBLIC_API_BASE_URL || "",
    ),
    [token, setToken] = useState<string | null>(null),
    [user, setUser] = useState<UserView | null>(null),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState("");
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string; id?: string }>();
  const allowed = [
    "home",
    "events",
    "emergencies",
    "settings",
    "cameras",
    "people",
    "rules",
    "event",
    "incident",
    "camera",
  ];
  const route: Route = {
    screen: (allowed.includes(params.view || "")
      ? params.view
      : "home") as Route["screen"],
    id: params.id,
  };
  const setRoute = useCallback(
    (value: Route) =>
      router.setParams({ view: value.screen, id: value.id || "" }),
    [router],
  );
  const pending = useRef<string | null>(null);
  const expire = useCallback(() => {
    setToken(null);
    setUser(null);
    void SecureStore.deleteItemAsync("hg-token");
  }, []);
  const api = useMemo(
    () => createApi(origin, token, expire),
    [origin, token, expire],
  );
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const storedOrigin = await SecureStore.getItemAsync("hg-origin"),
          saved = await SecureStore.getItemAsync("hg-token");
        const base = storedOrigin || process.env.EXPO_PUBLIC_API_BASE_URL || "";
        if (base && active) setOrigin(base);
        if (saved && base) {
          const me = await createApi(base, saved, expire)("auth/me");
          if (active) {
            setToken(saved);
            setUser(me);
          }
        }
      } catch (e) {
        if (active)
          setNotice("Volvé a iniciar sesión o revisá la conexión al servidor.");
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [expire]);
  const openPush = useCallback((data: unknown) => {
    const id = eventFromNotification(data);
    if (id) pending.current = id;
  }, []);
  useEffect(() => {
    let mounted = true;
    const receive = (response: Notifications.NotificationResponse) => {
      openPush(response.notification.request.content.data);
      if (token && pending.current) {
        setRoute({ screen: "event", id: pending.current });
        pending.current = null;
      }
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(receive);
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (mounted && r) receive(r);
    });
    const links = Linking.addEventListener("url", ({ url }) => {
      const match = /^homeguard:\/\/events\/([0-9a-f-]+)$/i.exec(url);
      if (match) {
        openPush({ event_id: match[1] });
        if (token && pending.current) {
          setRoute({ screen: "event", id: pending.current });
          pending.current = null;
        }
      }
    });
    return () => {
      mounted = false;
      subscription.remove();
      links.remove();
    };
  }, [token, openPush, setRoute]);
  async function login(email: string, password: string, base: string) {
    const validated = serverOrigin(base);
    const issued = await createApi(
      validated,
      null,
      expire,
    )("auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, platform: "mobile" }),
    });
    await SecureStore.setItemAsync("hg-origin", validated);
    await SecureStore.setItemAsync("hg-token", issued.token);
    setOrigin(validated);
    setToken(issued.token);
    setUser(issued.user);
    setNotice("");
    if (pending.current) {
      setRoute({ screen: "event", id: pending.current });
      pending.current = null;
    }
  }
  async function logout() {
    try {
      await api("push-devices", {
        method: "DELETE",
        body: JSON.stringify({ installation_id: await installationId() }),
      });
      await api("auth/logout", { method: "POST" });
    } catch {}
    expire();
    setRoute({ screen: "home" });
  }
  if (!ready)
    return (
      <SafeAreaView style={s.root}>
        <ActivityIndicator size="large" color="#227960" />
      </SafeAreaView>
    );
  if (!token || !user)
    return <Login origin={origin} initialNotice={notice} onLogin={login} />;
  const navigate = (screen: Route["screen"], id?: string) => {
    setNotice("");
    setRoute({ screen, id });
  };
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View>
          <Text style={s.brand}>HomeGuard</Text>
          <Text style={s.subtle}>
            {user.nombre} · {user.rol.toLowerCase()}
          </Text>
        </View>
        <Text style={s.demo}>DEMO</Text>
      </View>
      {notice && (
        <Text accessibilityRole="alert" style={s.notice}>
          {notice}
        </Text>
      )}
      <View style={{ flex: 1 }} key={`${route.screen}:${route.id || ""}`}>
        {route.screen === "home" ? (
          <Home api={api} user={user} navigate={navigate} />
        ) : route.screen === "events" ? (
          <Events api={api} navigate={navigate} />
        ) : route.screen === "event" ? (
          <EventDetail
            api={api}
            id={route.id!}
            token={token}
            origin={origin}
            navigate={navigate}
          />
        ) : route.screen === "emergencies" ? (
          <Incidents api={api} navigate={navigate} />
        ) : route.screen === "incident" ? (
          <Incident api={api} id={route.id!} navigate={navigate} />
        ) : route.screen === "settings" ? (
          <Settings api={api} origin={origin} logout={() => void logout()} />
        ) : (
          <Integration
            api={api}
            kind={route.screen as "cameras" | "people" | "rules" | "camera"}
            id={route.id}
            token={token}
            origin={origin}
            navigate={navigate}
          />
        )}
      </View>
      <View style={s.nav}>
        {(
          [
            { screen: "home", label: "Inicio" },
            { screen: "events", label: "Eventos" },
            { screen: "emergencies", label: "Emergencias" },
            { screen: "settings", label: "Ajustes" },
          ] as const
        )
          .filter(
            (x) =>
              user.rol !== "INVITADO" ||
              ["home", "settings"].includes(x.screen),
          )
          .map((item) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: route.screen === item.screen }}
              key={item.screen}
              onPress={() => navigate(item.screen)}
              style={s.navItem}
            >
              <Text
                style={{
                  color: route.screen === item.screen ? "#137357" : "#647a75",
                  fontWeight: route.screen === item.screen ? "700" : "400",
                  fontSize: 12,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
      </View>
    </SafeAreaView>
  );
}
function Login({
  origin,
  initialNotice,
  onLogin,
}: {
  origin: string;
  initialNotice: string;
  onLogin: (email: string, password: string, origin: string) => Promise<void>;
}) {
  const [base, setBase] = useState(origin),
    [email, setEmail] = useState("admin@homeguard.local"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initialNotice),
    [busy, setBusy] = useState(false);
  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingTop: 70 }]}
      >
        <Text style={s.brand}>HomeGuard</Text>
        <Text style={s.title}>Tu hogar, más cerca.</Text>
        <Text style={s.subtle}>
          Conectá tu aplicación al servidor de la universidad.
        </Text>
        <Card>
          <Text style={s.label}>Servidor (IP de la PC)</Text>
          <TextInput
            accessibilityLabel="Servidor"
            style={s.input}
            value={base}
            onChangeText={setBase}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="http://192.168.1.50:3000"
          />
          <Text style={s.label}>Correo</Text>
          <TextInput
            accessibilityLabel="Correo"
            style={s.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={s.label}>Contraseña</Text>
          <TextInput
            accessibilityLabel="Contraseña"
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          <Button
            title={busy ? "Conectando…" : "Iniciar sesión"}
            disabled={busy}
            onPress={() => {
              setBusy(true);
              setError("");
              onLogin(email, password, base)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
        </Card>
        <Text style={s.subtle}>
          PC y teléfono deben compartir Wi-Fi. La PC necesita habilitar el
          acceso LAN. HTTP se admite solo en la demostración con datos
          ficticios.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
function Remote({
  resource,
  children,
}: {
  resource: ReturnType<typeof useRemote>;
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={resource.busy}
          onRefresh={resource.reload}
        />
      }
    >
      {resource.error ? (
        <Card>
          <Text style={s.error}>{resource.error}</Text>
          <Button title="Reintentar" onPress={resource.reload} secondary />
        </Card>
      ) : !resource.data ? (
        <ActivityIndicator color="#227960" />
      ) : (
        children
      )}
    </ScrollView>
  );
}
function Home({
  api,
  user,
  navigate,
}: {
  api: Api;
  user: UserView;
  navigate: (screen: Route["screen"], id?: string) => void;
}) {
  const r = useRemote("dashboard", api);
  return (
    <Remote resource={r}>
      <Text style={s.title}>Vista de tu hogar</Text>
      <Card>
        <Text style={s.subtle}>Modo actual</Text>
        <Text style={s.heading}>
          {stateNames[r.data?.mode?.mode] || "Consultando"}
        </Text>
        <Text style={s.subtle}>
          Las cámaras procesan en el servidor, aunque cierres esta app.
        </Text>
      </Card>
      {r.data && (
        <View style={s.stats}>
          <Card>
            <Text style={s.number}>{r.data.counts.new}</Text>
            <Text>Eventos nuevos</Text>
          </Card>
          <Card>
            <Text style={s.number}>{r.data.counts.emergency}</Text>
            <Text>Emergencias</Text>
          </Card>
        </View>
      )}
      {user.rol !== "INVITADO" && (
        <>
          <Text style={s.heading}>Mi hogar</Text>
          <Button
            secondary
            title="Cámaras"
            onPress={() => navigate("cameras")}
          />
          <Button
            secondary
            title="Personas"
            onPress={() => navigate("people")}
          />
          <Button
            secondary
            title="Movimientos y reglas"
            onPress={() => navigate("rules")}
          />
          {r.data?.active_incidents?.map((i: IncidentView) => (
            <Button
              key={i.id}
              title={`Emergencia: ${stateNames[i.state] || i.state}`}
              onPress={() => navigate("incident", i.id)}
            />
          ))}
        </>
      )}
      <Text style={s.subtle}>
        Prototipo universitario · Llamadas y actuadores simulados.
      </Text>
    </Remote>
  );
}
function Events({
  api,
  navigate,
}: {
  api: Api;
  navigate: (screen: Route["screen"], id?: string) => void;
}) {
  const [category, setCategory] = useState(""),
    [cursor, setCursor] = useState("");
  const r = useRemote(
    `events?limit=20${category ? "&category=" + category : ""}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
    api,
  );
  return (
    <Remote resource={r}>
      <Text style={s.title}>Historial</Text>
      <View style={s.chips}>
        {["", "SECURITY", "MOVEMENT", "EMERGENCY"].map((c) => (
          <Pressable
            key={c}
            style={[s.chip, category === c && { backgroundColor: "#d8eee3" }]}
            onPress={() => {
              setCategory(c);
              setCursor("");
            }}
          >
            <Text>
              {
                (
                  {
                    "": "Todos",
                    SECURITY: "Seguridad",
                    MOVEMENT: "Movimientos",
                    EMERGENCY: "Emergencias",
                  } as Record<string, string>
                )[c]
              }
            </Text>
          </Pressable>
        ))}
      </View>
      {r.data?.items?.length === 0 && (
        <Card>
          <Text>No hay eventos para este filtro.</Text>
        </Card>
      )}
      {r.data?.items?.map((e: EventView) => (
        <Pressable
          accessibilityRole="button"
          key={e.id}
          onPress={() => navigate("event", e.id)}
        >
          <Card>
            <Text style={s.label}>
              {stateNames[e.source] || e.source} · {e.severity}
            </Text>
            <Text style={s.heading}>{e.summary}</Text>
            <Text style={s.subtle}>
              {formatDate(e.occurred_at)} · {stateNames[e.status]}
            </Text>
          </Card>
        </Pressable>
      ))}
      {r.data?.next_cursor && (
        <Button
          title="Página siguiente"
          secondary
          onPress={() => setCursor(r.data.next_cursor)}
        />
      )}
      {cursor && (
        <Button
          title="Volver al inicio"
          secondary
          onPress={() => setCursor("")}
        />
      )}
    </Remote>
  );
}
function EventDetail({
  api,
  id,
  token,
  origin,
  navigate,
}: {
  api: Api;
  id: string;
  token: string;
  origin: string;
  navigate: (screen: Route["screen"], id?: string) => void;
}) {
  const r = useRemote(`events/${id}`, api),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [clip, setClip] = useState<any>(null);
  const e = r.data;
  async function action(status: string) {
    setBusy(true);
    try {
      await api(`events/${id}`, {
        method: "PATCH",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({ status, expected_revision: e.revision }),
      });
      setMessage("Estado confirmado por el servidor.");
      r.reload();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Remote resource={r}>
      <Button
        title="Volver al historial"
        secondary
        onPress={() => navigate("events")}
      />
      {e && (
        <>
          <Text style={s.title}>{e.summary}</Text>
          <Text style={s.subtle}>
            {stateNames[e.source]} · {formatDate(e.occurred_at)} ·{" "}
            {stateNames[e.status]}
          </Text>
          <Card>
            <Text style={s.heading}>Evidencia</Text>
            {!e.decisions.clip_requested ? (
              <Text>Este evento no solicitó guardar clip.</Text>
            ) : (
              <>
                <Text>
                  Estado: {clip?.status || e.clip_status || "Pendiente"}
                </Text>
                <Button
                  secondary
                  title="Consultar clip"
                  onPress={() => {
                    api(`events/${id}/clip`)
                      .then(setClip)
                      .catch((err) => setMessage(err.message));
                  }}
                />
                {clip?.id && ["READY", "PARTIAL"].includes(clip.status) && (
                  <MediaPlayer
                    url={`${origin}/api/v1/clips/${clip.id}/content`}
                    token={token}
                  />
                )}
              </>
            )}
          </Card>
          {e.jobs?.map((j: any) => (
            <Card key={j.id}>
              <Text>
                {j.kind}: {j.status}
              </Text>
              {j.error_code && <Text style={s.subtle}>{j.error_code}</Text>}
            </Card>
          ))}
          <Button
            disabled={busy}
            title="Marcar revisado"
            onPress={() => void action("ACKNOWLEDGED")}
          />
          <Button
            disabled={busy}
            secondary
            title="Resolver"
            onPress={() => void action("RESOLVED")}
          />
          <Button
            disabled={busy}
            secondary
            title="Falsa alarma"
            onPress={() => void action("FALSE_POSITIVE")}
          />
          {message && (
            <Text accessibilityRole="alert" style={s.notice}>
              {message}
            </Text>
          )}
        </>
      )}
    </Remote>
  );
}
function Incidents({
  api,
  navigate,
}: {
  api: Api;
  navigate: (screen: Route["screen"], id?: string) => void;
}) {
  const r = useRemote("emergencies", api);
  return (
    <Remote resource={r}>
      <Text style={s.title}>Emergencias</Text>
      <Text style={s.notice}>
        Central de demostración. No se llama a servicios públicos.
      </Text>
      {!r.data?.items?.length && (
        <Card>
          <Text>No hay incidentes registrados.</Text>
        </Card>
      )}
      {r.data?.items?.map((i: any) => (
        <Pressable key={i.id} onPress={() => navigate("incident", i.id)}>
          <Card>
            <Text style={s.heading}>{stateNames[i.state] || i.state}</Text>
            <Text>{i.summary}</Text>
            <Text style={s.subtle}>{formatDate(i.created_at)}</Text>
          </Card>
        </Pressable>
      ))}
    </Remote>
  );
}
function Incident({
  api,
  id,
  navigate,
}: {
  api: Api;
  id: string;
  navigate: (screen: Route["screen"], id?: string) => void;
}) {
  const r = useRemote(`emergencies/${id}`, api),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const retry = useRef<{
    response: string;
    revision: number;
    key: string;
  } | null>(null);
  async function respond(response: "I_AM_OK" | "REQUEST_HELP") {
    setBusy(true);
    const rev = r.data.state_revision;
    const previous = retry.current;
    const key =
      previous?.response === response && previous.revision === rev
        ? previous.key
        : Crypto.randomUUID();
    retry.current = { response, revision: rev, key };
    try {
      const result = await api(
        `emergencies/${id}/respond`,
        incidentResponse(response, rev, key),
      );
      setMessage(
        `Respuesta confirmada: ${stateNames[result.state] || result.state}.`,
      );
      retry.current = null;
      r.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const closed = ["CANCELLED", "CLOSED", "FAILED"].includes(r.data?.state);
  return (
    <Remote resource={r}>
      <Button
        title="Volver a emergencias"
        secondary
        onPress={() => navigate("emergencies")}
      />
      <Text style={s.title}>{stateNames[r.data?.state] || "Emergencia"}</Text>
      <Card>
        <Text>
          Plazo de respuesta: {r.data && formatDate(r.data.response_deadline)}
        </Text>
        <Text style={s.subtle}>
          El servidor administra el plazo. Cerrar la app no lo cancela.
        </Text>
      </Card>
      {!closed && (
        <>
          <Button
            disabled={busy}
            title="Estoy bien"
            onPress={() => void respond("I_AM_OK")}
          />
          {["PENDING_RESPONSE", "NEEDS_REVIEW"].includes(r.data?.state) && (
            <Button
              disabled={busy}
              title="Solicitar ayuda simulada"
              secondary
              onPress={() => void respond("REQUEST_HELP")}
            />
          )}
        </>
      )}
      {r.data?.cancellation_requested && (
        <Text style={s.notice}>
          El operador recibió una solicitud de cancelación.
        </Text>
      )}
      {message && (
        <Text accessibilityRole="alert" style={s.notice}>
          {message}
        </Text>
      )}
      <Text style={s.subtle}>
        Esta función es académica y no sustituye un servicio de emergencia.
      </Text>
    </Remote>
  );
}
function Settings({
  api,
  origin,
  logout,
}: {
  api: Api;
  origin: string;
  logout: () => void;
}) {
  const r = useRemote("notification-preferences", api),
    [message, setMessage] = useState("");
  async function toggle(category: string) {
    const current = r.data;
    try {
      await api("notification-preferences", {
        method: "PATCH",
        body: JSON.stringify({
          categories: current.categories.includes(category)
            ? current.categories.filter((c: string) => c !== category)
            : [...current.categories, category],
          quiet_start: current.quiet_start,
          quiet_end: current.quiet_end,
          critical_demo_override: current.critical_demo_override,
          expected_revision: current.revision,
        }),
      });
      r.reload();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Ajustes</Text>
      <Card>
        <Text style={s.label}>Servidor</Text>
        <Text selectable>{origin}</Text>
        <Text style={s.subtle}>Para cambiar de servidor, cerrá sesión.</Text>
      </Card>
      <Card>
        <Text style={s.heading}>Notificaciones</Text>
        <Button
          title="Habilitar en este teléfono"
          onPress={() => {
            registerInstallation(api)
              .then(setMessage)
              .catch((e) => setMessage(e.message));
          }}
        />
        {r.error && <Text style={s.error}>{r.error}</Text>}
        {r.data &&
          ["SECURITY", "MOVEMENT", "EMERGENCY", "SYSTEM"].map((c) => (
            <Button
              secondary
              key={c}
              title={`${r.data.categories.includes(c) ? "✓" : "○"} ${c}`}
              onPress={() => void toggle(c)}
            />
          ))}
        <Text style={s.subtle}>
          Horarios silenciosos y excepción crítica se configuran también desde
          la web. Android puede silenciar avisos según sus propios ajustes.
        </Text>
      </Card>
      {message && <Text style={s.notice}>{message}</Text>}
      <Button title="Cerrar sesión" secondary onPress={logout} />
    </ScrollView>
  );
}
function Integration({
  api,
  kind,
  id,
  token,
  origin,
  navigate,
}: {
  api: Api;
  kind: "cameras" | "people" | "rules" | "camera";
  id?: string;
  token: string;
  origin: string;
  navigate: (screen: Route["screen"], id?: string) => void;
}) {
  const r = useRemote(kind === "camera" ? `cameras/${id}` : kind, api);
  const [stream, setStream] = useState<string | null>(null),
    [error, setError] = useState("");
  return (
    <Remote resource={r}>
      <Button
        secondary
        title="Volver a inicio"
        onPress={() => navigate("home")}
      />
      <Text style={s.title}>
        {
          {
            cameras: "Cámaras",
            people: "Personas",
            rules: "Movimientos",
            camera: "Detalle de cámara",
          }[kind]
        }
      </Text>
      {kind === "camera" ? (
        <Card>
          <Text style={s.heading}>{r.data?.name}</Text>
          <Text>
            {r.data?.status || "Estado informado por el servicio de cámaras"}
          </Text>
          <Text style={s.subtle}>
            La reproducción se habilitará cuando A entregue una sesión HLS
            autenticada y compatible.
          </Text>
          {stream && <MediaPlayer url={stream} token={token} />}
        </Card>
      ) : (
        <>
          {!r.data?.items?.length && (
            <Card>
              <Text>Sin registros disponibles.</Text>
            </Card>
          )}
          {r.data?.items?.map((item: any) => (
            <Card key={item.id}>
              <Text style={s.heading}>
                {item.name || item.label || item.id}
              </Text>
              <Text>{item.status || item.tag || ""}</Text>
              {kind === "cameras" && (
                <Button
                  secondary
                  title="Ver cámara"
                  onPress={() => navigate("camera", item.id)}
                />
              )}
            </Card>
          ))}
        </>
      )}
      {kind !== "cameras" && (
        <Text style={s.subtle}>
          La configuración de cámaras, asociación manual de personas y edición
          de reglas pertenecen al módulo A. El editor web requiere su propia
          sesión autenticada.
        </Text>
      )}
      <Button
        secondary
        title="Abrir aplicación web"
        onPress={() => {
          const url = new URL(origin);
          url.port = "5173";
          void Linking.openURL(url.origin);
        }}
      />
      {error && <Text style={s.error}>{error}</Text>}
    </Remote>
  );
}
function formatDate(value: string) {
  return value
    ? new Date(value).toLocaleString("es-BO", { timeZone: "America/La_Paz" })
    : "—";
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7f2" },
  header: {
    padding: 20,
    paddingTop: 36,
    borderBottomWidth: 1,
    borderColor: "#e1e8e1",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { fontSize: 25, fontWeight: "800", color: "#174e43" },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#173b33",
    marginBottom: 10,
    marginTop: 5,
  },
  heading: {
    fontSize: 18,
    fontWeight: "600",
    color: "#173b33",
    marginBottom: 8,
  },
  subtle: { fontSize: 13, lineHeight: 21, color: "#657a71" },
  content: { padding: 20, gap: 14, paddingBottom: 32 },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3eae2",
    gap: 9,
    marginBottom: 6,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#496455" },
  input: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ceddd1",
    padding: 13,
    fontSize: 16,
    color: "#18382e",
    backgroundColor: "#fff",
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#22795e",
    alignItems: "center",
    justifyContent: "center",
    padding: 13,
    marginVertical: 3,
  },
  secondary: { backgroundColor: "#e4efe6" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  error: { color: "#a33535", lineHeight: 21, paddingVertical: 8 },
  notice: {
    backgroundColor: "#f8efd7",
    color: "#796120",
    padding: 14,
    borderRadius: 10,
    lineHeight: 22,
  },
  demo: {
    color: "#227354",
    backgroundColor: "#dcecdc",
    padding: 8,
    borderRadius: 9,
    fontSize: 11,
    fontWeight: "700",
  },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#dbe4db",
    backgroundColor: "#fff",
    paddingBottom: 14,
  },
  navItem: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  number: { fontSize: 32, fontWeight: "700", color: "#22795e" },
  stats: { flexDirection: "row", gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
});
