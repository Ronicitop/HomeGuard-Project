import React, { useState, useEffect } from 'react';

export interface UsuarioSesion {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  permisos: string[];
}

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(() => {
    const sesion = localStorage.getItem('homeguard_user');
    return sesion ? JSON.parse(sesion) : null;
  });

  const [vistaAuth, setVistaAuth] = useState<'login' | 'registro'>('login');
  const [pestana, setPestana] = useState<'dashboard' | 'plano2d' | 'umbrales' | 'usuarios' | 'dispositivos'>('dashboard');

  const [loginEmail, setLoginEmail] = useState('admin@homeguard.local');
  const [loginPassword, setLoginPassword] = useState('admin123');
  const [errorAuth, setErrorAuth] = useState('');

  const [regNombre, setRegNombre] = useState('');
  const [regApellido, setRegApellido] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRolId, setRegRolId] = useState(2);

  const [estadoSistema, setEstadoSistema] = useState<any>({
    modo: 'AWAY',
    alertasActivas: 0,
    dispositivos: [],
    alertasRecientes: [],
    energia: { voltaje_v: 220, corriente_a: 3.8, potencia_w: 848.5, energia_kwh: 14.62 },
    plano2D: [],
    actuadores: []
  });
  const [pinSeleccionado, setPinSeleccionado] = useState<any>(null);
  const [listaUsuarios, setListaUsuarios] = useState<any[]>([]);
  const [listaRoles, setListaRoles] = useState<any[]>([]);
  const [listaDispositivos, setListaDispositivos] = useState<any[]>([]);
  const [listaUmbrales, setListaUmbrales] = useState<any[]>([]);

  useEffect(() => {
    const fetchStatus = () => {
      fetch('http://localhost:3000/api/status')
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setEstadoSistema({
              modo: data.modo || 'AWAY',
              alertasActivas: data.alertasActivas || 0,
              dispositivos: data.dispositivos || [],
              alertasRecientes: data.alertasRecientes || [],
              energia: data.energia || { voltaje_v: 220, corriente_a: 3.8, potencia_w: 848.5, energia_kwh: 14.62 },
              plano2D: data.plano2D || [],
              actuadores: data.actuadores || []
            });
          }
        })
        .catch(err => console.error('Error fetching status:', err));
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  const cargarAdminData = () => {
    fetch('http://localhost:3000/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (data.usuarios) setListaUsuarios(data.usuarios);
        if (data.roles) setListaRoles(data.roles);
      })
      .catch(err => console.error(err));

    fetch('http://localhost:3000/api/admin/devices')
      .then(res => res.json())
      .then(data => setListaDispositivos(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));

    fetch('http://localhost:3000/api/admin/thresholds')
      .then(res => res.json())
      .then(data => setListaUmbrales(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    if (usuario) cargarAdminData();
  }, [usuario]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAuth('');
    fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.usuario) {
          setUsuario(data.usuario);
          localStorage.setItem('homeguard_user', JSON.stringify(data.usuario));
        } else {
          setErrorAuth(data.error || 'Credenciales inválidas');
        }
      })
      .catch(() => setErrorAuth('Error conectando al servidor'));
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAuth('');
    fetch('http://localhost:3000/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: regNombre,
        apellido: regApellido,
        email: regEmail,
        password: regPassword,
        rol_id: Number(regRolId)
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert('Cuenta registrada. Inicia sesión.');
          setVistaAuth('login');
          setLoginEmail(regEmail);
          setLoginPassword(regPassword);
        } else {
          setErrorAuth(data.error || 'Error al registrar');
        }
      })
      .catch(() => setErrorAuth('Error conectando al servidor'));
  };

  const handleLogout = () => {
    setUsuario(null);
    localStorage.removeItem('homeguard_user');
  };

  const cambiarModo = (nuevoModo: string) => {
    setEstadoSistema((prev: any) => ({ ...prev, modo: nuevoModo }));
    fetch('http://localhost:3000/api/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: nuevoModo, usuario_id: usuario?.id || 1 })
    }).catch(err => console.error('Error al cambiar modo:', err));
  };

  const conmutarActuador = (codigo: string, estadoActual: string) => {
    if (usuario?.rol?.toUpperCase() === 'INVITADO') {
      alert('Permiso denegado: El rol INVITADO solo tiene acceso de lectura.');
      return;
    }
    const nuevoEstado = estadoActual === 'ON' ? 'OFF' : 'ON';
    setEstadoSistema((prev: any) => ({
      ...prev,
      actuadores: prev.actuadores.map((a: any) => a.codigo === codigo ? { ...a, estado_actual: nuevoEstado } : a)
    }));

    fetch('http://localhost:3000/api/actuators/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, estado: nuevoEstado, usuario_id: usuario?.id || 1 })
    }).catch(err => console.error('Error comando actuador:', err));
  };

  const resolverAlerta = (idAlerta?: number) => {
    fetch('http://localhost:3000/api/alerts/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_alerta: idAlerta })
    }).then(() => {
      setEstadoSistema((prev: any) => ({
        ...prev,
        alertasActivas: idAlerta ? Math.max(0, prev.alertasActivas - 1) : 0,
        alertasRecientes: idAlerta ? prev.alertasRecientes.filter((a: any) => a.id !== idAlerta) : []
      }));
    }).catch(err => console.error('Error al resolver alerta:', err));
  };

  const sensorPuerta = estadoSistema.dispositivos?.find((d: any) => d.tipo_sensor?.toLowerCase() === 'puerta');
  const sensorMovimiento = estadoSistema.dispositivos?.find((d: any) => d.tipo_sensor?.toLowerCase() === 'movimiento');
  const sensorHumo = estadoSistema.dispositivos?.find((d: any) => d.tipo_sensor?.toLowerCase() === 'humo');
  const sensorAgua = estadoSistema.dispositivos?.find((d: any) => d.tipo_sensor?.toLowerCase() === 'agua');
  const sensorTemperatura = estadoSistema.dispositivos?.find((d: any) => d.tipo_sensor?.toLowerCase() === 'temperatura');

  const esSensorEnAlerta = (tipo: string) => {
    const t = tipo.toLowerCase();
    if (t === 'puerta') return sensorPuerta?.estado_texto === 'OPEN';
    if (t === 'movimiento') return sensorMovimiento?.estado_texto === 'MOTION_DETECTED';
    if (t === 'humo') return sensorHumo?.estado_texto === 'SMOKE_DETECTED';
    if (t === 'agua') return sensorAgua?.estado_texto === 'WATER_LEAK';
    if (t === 'temperatura') return (sensorTemperatura?.valor_numerico || 24) > 40;
    return false;
  };

  const porcentajeConsumoMensual = Math.min(100, Math.round(((estadoSistema.energia?.energia_kwh || 14.6) / 250) * 100));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', padding: '1.5rem', fontFamily: 'system-ui, sans-serif', color: '#1e293b' }}>
      <div style={{ maxWidth: '1050px', margin: '0 auto' }}>

        {!usuario ? (
          <div style={{ maxWidth: '420px', margin: '4rem auto', background: 'white', padding: '2.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>HomeGuard Security</h1>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Acceso al Sistema y Gestión de Seguridad</p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '0.5rem' }}>
              <button type="button" onClick={() => setVistaAuth('login')} style={{ flex: 1, border: 'none', padding: '0.5rem', fontWeight: 'bold', borderRadius: '0.35rem', cursor: 'pointer', background: vistaAuth === 'login' ? 'white' : 'transparent', color: vistaAuth === 'login' ? '#0f172a' : '#64748b' }}>
                Iniciar Sesión
              </button>
              <button type="button" onClick={() => setVistaAuth('registro')} style={{ flex: 1, border: 'none', padding: '0.5rem', fontWeight: 'bold', borderRadius: '0.35rem', cursor: 'pointer', background: vistaAuth === 'registro' ? 'white' : 'transparent', color: vistaAuth === 'registro' ? '#0f172a' : '#64748b' }}>
                Registrarse
              </button>
            </div>

            {errorAuth && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {errorAuth}
              </div>
            )}

            {vistaAuth === 'login' ? (
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Correo</label>
                  <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Contraseña</label>
                  <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required style={{ width: '100%', padding: '0.65rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', boxSizing: 'border-box' }} />
                </div>
                <button type="submit" style={{ width: '100%', background: '#059669', color: 'white', border: 'none', padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
                  Entrar al Panel
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <input type="text" placeholder="Nombre" value={regNombre} onChange={e => setRegNombre(e.target.value)} required style={{ flex: 1, padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.4rem', boxSizing: 'border-box' }} />
                  <input type="text" placeholder="Apellido" value={regApellido} onChange={e => setRegApellido(e.target.value)} required style={{ flex: 1, padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.4rem', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '0.85rem' }}>
                  <input type="email" placeholder="Correo" value={regEmail} onChange={e => setRegEmail(e.target.value)} required style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.4rem', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '0.85rem' }}>
                  <input type="password" placeholder="Contraseña" value={regPassword} onChange={e => setRegPassword(e.target.value)} required style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.4rem', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <select value={regRolId} onChange={e => setRegRolId(Number(e.target.value))} style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '0.4rem', boxSizing: 'border-box', background: 'white' }}>
                    {listaRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.nombre} - {r.descripcion}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" style={{ width: '100%', background: '#2563eb', color: 'white', border: 'none', padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
                  Crear Cuenta
                </button>
              </form>
            )}
          </div>
        ) : (
          <div>
            {/* Barra superior */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', background: 'white', padding: '1rem 1.5rem', borderRadius: '0.75rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>👤</span>
                <div>
                  <strong style={{ display: 'block', fontSize: '0.95rem' }}>{usuario.nombre} {usuario.apellido}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{usuario.email}</span>
                </div>
                <span style={{ marginLeft: '0.5rem', background: '#dbeafe', color: '#1e40af', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontWeight: 'bold', fontSize: '0.75rem' }}>
                  ROL: {usuario.rol}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '0.5rem' }}>
                  <button type="button" onClick={() => setPestana('dashboard')} style={{ border: 'none', padding: '0.4rem 0.75rem', borderRadius: '0.35rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', background: pestana === 'dashboard' ? 'white' : 'transparent', color: pestana === 'dashboard' ? '#0f172a' : '#64748b' }}>
                    Monitoreo en Vivo
                  </button>
                  <button type="button" onClick={() => setPestana('plano2d')} style={{ border: 'none', padding: '0.4rem 0.75rem', borderRadius: '0.35rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', background: pestana === 'plano2d' ? 'white' : 'transparent', color: pestana === 'plano2d' ? '#0f172a' : '#64748b' }}>
                    Plano 2D Hogar
                  </button>
                  <button type="button" onClick={() => setPestana('umbrales')} style={{ border: 'none', padding: '0.4rem 0.75rem', borderRadius: '0.35rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', background: pestana === 'umbrales' ? 'white' : 'transparent', color: pestana === 'umbrales' ? '#0f172a' : '#64748b' }}>
                    Umbrales
                  </button>
                  <button type="button" onClick={() => setPestana('usuarios')} style={{ border: 'none', padding: '0.4rem 0.75rem', borderRadius: '0.35rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', background: pestana === 'usuarios' ? 'white' : 'transparent', color: pestana === 'usuarios' ? '#0f172a' : '#64748b' }}>
                    Usuarios
                  </button>
                  <button type="button" onClick={() => setPestana('dispositivos')} style={{ border: 'none', padding: '0.4rem 0.75rem', borderRadius: '0.35rem', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', background: pestana === 'dispositivos' ? 'white' : 'transparent', color: pestana === 'dispositivos' ? '#0f172a' : '#64748b' }}>
                    Nodos IoT
                  </button>
                </div>
                <button type="button" onClick={handleLogout} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '0.45rem 0.85rem', borderRadius: '0.4rem', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}>
                  Salir
                </button>
              </div>
            </div>

            {/* ================= DASHBOARD PRINCIPAL (SPRINTS 1 + 2 + 3) ================= */}
            {pestana === 'dashboard' && (
              <>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>HomeGuard - Panel Central</h2>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Seguridad Perimetral, Eficiencia Energética y Control de Actuadores</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => cambiarModo('AWAY')} style={{ border: 'none', padding: '0.6rem 1.1rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', background: estadoSistema.modo === 'AWAY' ? '#059669' : '#e2e8f0', color: estadoSistema.modo === 'AWAY' ? 'white' : '#334155' }}>
                      Ausencia
                    </button>
                    <button type="button" onClick={() => cambiarModo('HOME')} style={{ border: 'none', padding: '0.6rem 1.1rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', background: estadoSistema.modo === 'HOME' ? '#2563eb' : '#e2e8f0', color: estadoSistema.modo === 'HOME' ? 'white' : '#334155' }}>
                      En Casa
                    </button>
                    <button type="button" onClick={() => cambiarModo('DISARMED')} style={{ border: 'none', padding: '0.6rem 1.1rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', background: estadoSistema.modo === 'DISARMED' ? '#475569' : '#e2e8f0', color: estadoSistema.modo === 'DISARMED' ? 'white' : '#334155' }}>
                      Desarmado
                    </button>
                  </div>
                </header>

                {/* Banner Global */}
                <div style={{ background: estadoSistema.alertasActivas === 0 && sensorPuerta?.estado_texto !== 'OPEN' ? '#ecfdf5' : '#ffe4e6', border: estadoSistema.alertasActivas === 0 && sensorPuerta?.estado_texto !== 'OPEN' ? '1px solid #10b981' : '1px solid #f43f5e', padding: '1.25rem 1.5rem', borderRadius: '0.75rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: estadoSistema.alertasActivas === 0 && sensorPuerta?.estado_texto !== 'OPEN' ? '#047857' : '#e11d48' }}>
                      {estadoSistema.alertasActivas === 0 && sensorPuerta?.estado_texto !== 'OPEN' ? '✓ TODO SEGURO' : '⚠ ¡ALERTA DE SEGURIDAD DETECTADA!'}
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Modo actual del sistema: <strong>{estadoSistema.modo}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {estadoSistema.alertasActivas > 0 && (
                      <button type="button" onClick={() => resolverAlerta()} style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.5rem 0.9rem', borderRadius: '0.4rem', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}>
                        ✓ Resolver Todas
                      </button>
                    )}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Alertas activas</span>
                      <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#e11d48' }}>{estadoSistema.alertasActivas}</span>
                    </div>
                  </div>
                </div>

                {/* Grid de 5 Sensores */}
                <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                  Telemetría de Sensores en Tiempo Real
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'white', padding: '1.2rem', borderRadius: '0.75rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '2rem' }}>🚪</span>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>Puerta Principal</div>
                    <div style={{ fontWeight: 800, marginTop: '0.25rem', color: sensorPuerta?.estado_texto === 'OPEN' ? '#e11d48' : '#059669' }}>
                      ● {sensorPuerta?.estado_texto === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                    </div>
                  </div>
                  <div style={{ background: 'white', padding: '1.2rem', borderRadius: '0.75rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '2rem' }}>🏃</span>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>Sensor PIR</div>
                    <div style={{ fontWeight: 800, marginTop: '0.25rem', color: sensorMovimiento?.estado_texto === 'MOTION_DETECTED' ? '#d97706' : '#059669' }}>
                      ● {sensorMovimiento?.estado_texto === 'MOTION_DETECTED' ? 'DETECTADO' : 'INACTIVO'}
                    </div>
                  </div>
                  <div style={{ background: 'white', padding: '1.2rem', borderRadius: '0.75rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '2rem' }}>☁️</span>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>Detector Humo</div>
                    <div style={{ fontWeight: 800, marginTop: '0.25rem', color: sensorHumo?.estado_texto === 'SMOKE_DETECTED' ? '#e11d48' : '#059669' }}>
                      ● {sensorHumo?.estado_texto === 'SMOKE_DETECTED' ? 'HUMO DETECTADO' : 'NORMAL'}
                    </div>
                  </div>
                  <div style={{ background: 'white', padding: '1.2rem', borderRadius: '0.75rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '2rem' }}>💧</span>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>Sonda de Agua</div>
                    <div style={{ fontWeight: 800, marginTop: '0.25rem', color: sensorAgua?.estado_texto === 'WATER_LEAK' ? '#e11d48' : '#059669' }}>
                      ● {sensorAgua?.estado_texto === 'WATER_LEAK' ? 'FUGA DETECTADA' : 'SECO'}
                    </div>
                  </div>
                  <div style={{ background: 'white', padding: '1.2rem', borderRadius: '0.75rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <span style={{ fontSize: '2rem' }}>🌡</span>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>Temperatura</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.25rem', color: (sensorTemperatura?.valor_numerico || 24) > 40 ? '#e11d48' : '#1e293b' }}>
                      {sensorTemperatura?.valor_numerico || '24.0'} °C
                    </div>
                  </div>
                </div>

                {/* SPRINT 3: MONITOREO ENERGÉTICO (HU11) Y CONTROL DE ACTUADORES (HU13) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                  {/* Módulo Energía kWh */}
                  <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>⚡ Monitoreo Energético (SCT-013)</h3>
                      <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 'bold' }}>
                        {estadoSistema.energia?.voltaje_v || 220} V AC
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginBottom: '1rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Potencia Instantánea</span>
                        <strong style={{ fontSize: '1.5rem', color: (estadoSistema.energia?.potencia_w || 0) > 3500 ? '#e11d48' : '#2563eb' }}>
                          {Number(estadoSistema.energia?.potencia_w || 848.5).toFixed(1)} W
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Consumo Acumulado</span>
                        <strong style={{ fontSize: '1.5rem', color: '#059669' }}>
                          {Number(estadoSistema.energia?.energia_kwh || 14.62).toFixed(2)} kWh
                        </strong>
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                        <span>Meta Mensual (250 kWh)</span>
                        <span><strong>{porcentajeConsumoMensual}%</strong></span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ width: `${porcentajeConsumoMensual}%`, height: '100%', background: porcentajeConsumoMensual > 85 ? '#e11d48' : '#10b981' }} />
                      </div>
                    </div>
                  </div>

                  {/* Módulo Control Rápido de Actuadores */}
                  <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#0f172a' }}>🎛️ Control Rápido de Actuadores</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {(estadoSistema.actuadores?.length > 0 ? estadoSistema.actuadores : [
                        { codigo: 'ACT_SIRENA_01', nombre: 'Sirena Perimetral 12V', estado_actual: 'OFF' },
                        { codigo: 'ACT_RELE_01', nombre: 'Relé Corte Eléctrico General', estado_actual: 'ON' },
                        { codigo: 'ACT_VALVULA_01', nombre: 'Electroválvula Corte Agua', estado_actual: 'ON' }
                      ]).map((act: any) => (
                        <div key={act.codigo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                          <div>
                            <strong style={{ fontSize: '0.85rem', display: 'block' }}>{act.nombre}</strong>
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Código: {act.codigo}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => conmutarActuador(act.codigo, act.estado_actual)}
                            style={{
                              border: 'none',
                              padding: '0.4rem 0.9rem',
                              borderRadius: '9999px',
                              fontWeight: 'bold',
                              fontSize: '0.75rem',
                              cursor: usuario.rol === 'INVITADO' ? 'not-allowed' : 'pointer',
                              background: act.estado_actual === 'ON' ? '#059669' : '#64748b',
                              color: 'white'
                            }}>
                            {act.estado_actual === 'ON' ? '● ACTIVADO (ON)' : '○ APAGADO (OFF)'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Incidentes Activos (HU10) */}
                {estadoSistema.alertasActivas > 0 && (
                  <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ margin: '0 0 1rem 0', color: '#e11d48', fontSize: '1rem', textTransform: 'uppercase' }}>
                      🚨 Notificaciones e Incidentes Activos (Tiempo Real)
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {estadoSistema.alertasRecientes?.map((alerta: any) => (
                        <div key={alerta.id} style={{ borderLeft: `4px solid ${alerta.severidad === 'CRITICAL' ? '#e11d48' : '#d97706'}`, background: alerta.severidad === 'CRITICAL' ? '#fff1f2' : '#fffbeb', padding: '0.85rem 1rem', borderRadius: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '0.25rem', marginRight: '0.5rem', background: alerta.severidad === 'CRITICAL' ? '#e11d48' : '#d97706', color: 'white' }}>
                              {alerta.severidad || 'CRITICAL'}
                            </span>
                            <strong style={{ color: '#0f172a' }}>{alerta.titulo}</strong>
                            <span style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginTop: '0.25rem' }}>{alerta.regla_disparadora}</span>
                          </div>
                          <button type="button" onClick={() => resolverAlerta(alerta.id)} style={{ background: '#0f172a', color: 'white', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '0.35rem', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
                            Silenciar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ================= PLANO ARQUITECTÓNICO 2D INTERACTIVO (HU12) ================= */}
            {pestana === 'plano2d' && (
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>🗺️ Plano Arquitectónico 2D Interactivo del Hogar</h2>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Haz clic sobre cualquier sensor en el plano para inspeccionar su telemetría en vivo</p>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>● Nominal</span>
                    <span style={{ color: '#e11d48', fontWeight: 'bold' }}>● Alerta Activa</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
                  {/* SVG Planta Arquitectónica */}
                  <svg viewBox="0 0 600 380" style={{ width: '100%', background: '#f8fafc', border: '2px solid #cbd5e1', borderRadius: '0.75rem' }}>
                    <rect x="20" y="20" width="560" height="340" fill="#ffffff" stroke="#334155" strokeWidth="4" />
                    <line x1="220" y1="20" x2="220" y2="360" stroke="#64748b" strokeWidth="3" />
                    <line x1="20" y1="220" x2="220" y2="220" stroke="#64748b" strokeWidth="3" />
                    <line x1="400" y1="20" x2="400" y2="360" stroke="#64748b" strokeWidth="3" />
                    <line x1="400" y1="200" x2="580" y2="200" stroke="#64748b" strokeWidth="3" />

                    <text x="45" y="50" fill="#94a3b8" fontSize="13" fontWeight="bold">SALA DE ESTAR</text>
                    <text x="45" y="250" fill="#94a3b8" fontSize="13" fontWeight="bold">ENTRADA PRINCIPAL</text>
                    <text x="255" y="50" fill="#94a3b8" fontSize="13" fontWeight="bold">PASILLO CENTRAL</text>
                    <text x="425" y="50" fill="#94a3b8" fontSize="13" fontWeight="bold">COCINA</text>
                    <text x="425" y="230" fill="#94a3b8" fontSize="13" fontWeight="bold">LAVANDERÍA</text>

                    {(estadoSistema.plano2D?.length > 0 ? estadoSistema.plano2D : [
                      { id: 1, tipo_sensor: 'puerta', etiqueta: 'Puerta Principal', zona_habitacion: 'Entrada', pos_x: 18, pos_y: 78 },
                      { id: 2, tipo_sensor: 'movimiento', etiqueta: 'Sensor PIR Sala', zona_habitacion: 'Sala de Estar', pos_x: 20, pos_y: 35 },
                      { id: 3, tipo_sensor: 'temperatura', etiqueta: 'Sensor Térmico', zona_habitacion: 'Pasillo Central', pos_x: 52, pos_y: 35 },
                      { id: 4, tipo_sensor: 'humo', etiqueta: 'Detector Humo MQ-2', zona_habitacion: 'Cocina', pos_x: 80, pos_y: 30 },
                      { id: 5, tipo_sensor: 'agua', etiqueta: 'Sonda Fuga Agua', zona_habitacion: 'Lavandería', pos_x: 80, pos_y: 75 }
                    ]).map((pin: any) => {
                      const cx = (pin.pos_x / 100) * 560 + 20;
                      const cy = (pin.pos_y / 100) * 340 + 20;
                      const alerta = esSensorEnAlerta(pin.tipo_sensor);
                      return (
                        <g key={pin.id} style={{ cursor: 'pointer' }} onClick={() => setPinSeleccionado(pin)}>
                          <circle cx={cx} cy={cy} r="18" fill={alerta ? '#fecdd3' : '#d1fae5'} opacity="0.7" />
                          <circle cx={cx} cy={cy} r="10" fill={alerta ? '#e11d48' : '#059669'} stroke="#ffffff" strokeWidth="2.5" />
                          <text x={cx} y={cy + 24} textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="bold">
                            {pin.etiqueta}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Ficha lateral del nodo seleccionado */}
                  <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#0f172a' }}>📍 Inspector de Dispositivo</h3>
                    {pinSeleccionado ? (
                      <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div><strong>Nombre:</strong> {pinSeleccionado.etiqueta}</div>
                        <div><strong>Habitación:</strong> {pinSeleccionado.zona_habitacion}</div>
                        <div><strong>Coordenadas 2D:</strong> ({pinSeleccionado.pos_x}%, {pinSeleccionado.pos_y}%)</div>
                        <div>
                          <strong>Estado Actual:</strong>{' '}
                          <span style={{ fontWeight: 'bold', color: esSensorEnAlerta(pinSeleccionado.tipo_sensor) ? '#e11d48' : '#059669' }}>
                            {esSensorEnAlerta(pinSeleccionado.tipo_sensor) ? '⚠ EN ALERTA' : '✓ NOMINAL'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                        Selecciona un pin en el mapa arquitectónico para ver sus coordenadas espaciales y estado telemétrico.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN UMBRALES */}
            {pestana === 'umbrales' && (
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>Parámetros y Umbrales de Seguridad</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '0.75rem' }}>Variable</th>
                      <th style={{ padding: '0.75rem' }}>Mínimo</th>
                      <th style={{ padding: '0.75rem' }}>Máximo</th>
                      <th style={{ padding: '0.75rem' }}>Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaUmbrales.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 'bold', textTransform: 'capitalize' }}>{u.tipo_sensor}</td>
                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{u.valor_minimo ?? '-'}</td>
                        <td style={{ padding: '0.75rem', color: '#e11d48', fontWeight: 'bold' }}>{u.valor_maximo ?? '-'}</td>
                        <td style={{ padding: '0.75rem' }}>{u.unidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SECCIÓN USUARIOS */}
            {pestana === 'usuarios' && (
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>Directorio de Usuarios y Accesos</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                      <th style={{ padding: '0.75rem' }}>Nombre</th>
                      <th style={{ padding: '0.75rem' }}>Correo</th>
                      <th style={{ padding: '0.75rem' }}>Rol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaUsuarios.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>{u.nombre} {u.apellido}</td>
                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{u.email}</td>
                        <td style={{ padding: '0.75rem' }}><span style={{ background: '#e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontWeight: 'bold' }}>{u.rol}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SECCIÓN DISPOSITIVOS */}
            {pestana === 'dispositivos' && (
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>Dispositivos y Nodos de Seguridad</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {listaDispositivos.map(dev => (
                    <div key={dev.device_id} style={{ border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '1rem', display: 'block' }}>{dev.nombre} ({dev.device_id})</strong>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Ubicación: {dev.zona} | IP: {dev.ip_local || '192.168.1.50'}</span>
                      </div>
                      <span style={{ background: dev.estado_conexion === 'EN_LINEA' ? '#dcfce7' : '#fee2e2', color: dev.estado_conexion === 'EN_LINEA' ? '#15803d' : '#b91c1c', padding: '0.35rem 0.75rem', borderRadius: '9999px', fontWeight: 'bold', fontSize: '0.75rem' }}>
                        ● {dev.estado_conexion === 'EN_LINEA' ? 'EN LÍNEA' : 'FUERA DE LÍNEA'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}