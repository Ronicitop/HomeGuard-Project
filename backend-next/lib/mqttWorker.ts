import mqtt, { MqttClient } from 'mqtt';
import { query } from './db';

let client: MqttClient | null = null;
let modoActual: 'HOME' | 'AWAY' | 'DISARMED' = 'AWAY';

const memoriaEventos = {
  ultimaAperturaPuerta: 0,
  ultimoMovimiento: 0,
  ultimoHumo: false,
  ultimaTemperatura: 24.0,
};

export function obtenerModoActual() {
  return modoActual;
}

export async function cambiarModoActual(nuevoModo: 'HOME' | 'AWAY' | 'DISARMED', usuarioId: number = 1) {
  modoActual = nuevoModo;
  try {
    await query(`UPDATE ModoHogar SET activo = FALSE WHERE activo = TRUE`);
    await query(
      `INSERT INTO ModoHogar (modo_actual, activo, usuario_id) VALUES ($1, TRUE, $2)`,
      [nuevoModo, usuarioId]
    );
    console.log(`[HomeGuard - HU7] Modo conmutado a: ${nuevoModo} por usuario ID ${usuarioId}`);
  } catch (error: any) {
    console.error('[HomeGuard] Error persistiendo modo en base de datos:', error.message);
  }
}

export async function ejecutarComandoActuador(codigo: string, nuevoEstado: 'ON' | 'OFF', usuarioId: number | null = 1, origen: string = 'MANUAL') {
  try {
    const res = await query(
      `UPDATE Actuador 
       SET estado_actual = $1, ultima_activacion = NOW(), usuario_id = $2 
       WHERE codigo = $3 
       RETURNING *`,
      [nuevoEstado, usuarioId, codigo]
    );

    if (res.rows.length > 0) {
      if (!client) iniciarServicioMQTT(false);
      const act = res.rows[0];
      const payload = JSON.stringify({
        device_id: act.device_id,
        actuator_code: act.codigo,
        type: act.tipo,
        command: nuevoEstado,
        origin: origen,
        timestamp: Date.now()
      });
      client.publish('homeguard/actuators/control', payload, { qos: 1 });
      console.log(`⚡ [ACTUADOR ${origen}] ${act.nombre} (${codigo}) -> ${nuevoEstado}`);
    }
    return res.rows[0] || null;
  } catch (err: any) {
    console.error('[ACTUADOR ERROR]:', err.message);
    return null;
  }
}

async function evaluarMotorReglas(sensor: string, estado: string | null, valor: number | null, telemetriaId: number) {
  const ahora = Date.now();

  try {
    const resModo = await query(
      `SELECT id, modo_actual FROM ModoHogar WHERE activo = TRUE ORDER BY fecha_activacion DESC LIMIT 1`
    );
    const modoVigente = resModo.rows[0]?.modo_actual || modoActual;
    const modoId = resModo.rows[0]?.id || null;

    let umbralMaxTemp = 40.0;
    try {
      const resUmbrales = await query(
        `SELECT valor_maximo FROM ConfiguracionUmbral WHERE tipo_sensor = 'temperatura' ORDER BY actualizado_en DESC LIMIT 1`
      );
      if (resUmbrales.rows.length > 0 && resUmbrales.rows[0].valor_maximo) {
        umbralMaxTemp = Number(resUmbrales.rows[0].valor_maximo);
      }
    } catch {
      umbralMaxTemp = 40.0;
    }

    if (sensor === 'puerta' && estado === 'OPEN') memoriaEventos.ultimaAperturaPuerta = ahora;
    if (sensor === 'movimiento' && (estado === 'MOTION_DETECTED' || estado === 'DETECTADO')) memoriaEventos.ultimoMovimiento = ahora;
    if (sensor === 'humo') memoriaEventos.ultimoHumo = estado === 'SMOKE_DETECTED' || estado === 'DETECTADO';
    if (sensor === 'temperatura' && valor !== null) memoriaEventos.ultimaTemperatura = Number(valor);

    if (modoVigente !== 'DISARMED') {
      // REGLA 1 (HU9): INTRUSIÓN CRÍTICA (<15s) -> Activa Sirena Automáticamente (HU13)
      if (modoVigente === 'AWAY') {
        const deltaMs = Math.abs(memoriaEventos.ultimaAperturaPuerta - memoriaEventos.ultimoMovimiento);
        const enVentana = deltaMs <= 15000 && memoriaEventos.ultimaAperturaPuerta > 0 && memoriaEventos.ultimoMovimiento > 0;

        if (enVentana && (sensor === 'puerta' || sensor === 'movimiento')) {
          memoriaEventos.ultimaAperturaPuerta = 0;
          memoriaEventos.ultimoMovimiento = 0;

          await query(
            `INSERT INTO AlertaCorrelacionada (titulo, severidad, regla_disparadora, modo_hogar_id, telemetria_origen_id, resuelta, fecha_hora)
             VALUES ($1, $2, $3, $4, $5, FALSE, NOW())`,
            [
              'Intrusión Crítica Detectada',
              'CRITICAL',
              'Apertura de puerta y detección de movimiento simultáneos (<15s) en Modo Ausencia',
              modoId,
              telemetriaId
            ]
          );
          await ejecutarComandoActuador('ACT_SIRENA_01', 'ON', null, 'AUTO_REGLA_INTRUSION');
        } else if (sensor === 'movimiento' && (estado === 'MOTION_DETECTED' || estado === 'DETECTADO') && memoriaEventos.ultimaAperturaPuerta === 0) {
          await query(
            `INSERT INTO AlertaCorrelacionada (titulo, severidad, regla_disparadora, modo_hogar_id, telemetria_origen_id, resuelta, fecha_hora)
             VALUES ($1, $2, $3, $4, $5, FALSE, NOW())`,
            [
              'Advertencia de Presencia Interior',
              'WARNING',
              'Detección de presencia interior sin apertura de puertas registrada',
              modoId,
              telemetriaId
            ]
          );
        }
      }

      if (modoVigente === 'HOME' && sensor === 'puerta' && estado === 'OPEN') {
        await query(
          `INSERT INTO AlertaCorrelacionada (titulo, severidad, regla_disparadora, modo_hogar_id, telemetria_origen_id, resuelta, fecha_hora)
           VALUES ($1, $2, $3, $4, $5, FALSE, NOW())`,
          [
            'Acceso Perimetral Abierto',
            'WARNING',
            'Apertura de puerta detectada en Modo En Casa',
            modoId,
            telemetriaId
          ]
        );
      }
    }

    // REGLA 2 (HU9 + HU13): INCENDIO CONFIRMADO -> Sirena ON + Corte Eléctrico OFF
    if (memoriaEventos.ultimoHumo && memoriaEventos.ultimaTemperatura > umbralMaxTemp) {
      if (sensor === 'humo' || sensor === 'temperatura') {
        memoriaEventos.ultimoHumo = false;
        await query(
          `INSERT INTO AlertaCorrelacionada (titulo, severidad, regla_disparadora, modo_hogar_id, telemetria_origen_id, resuelta, fecha_hora)
           VALUES ($1, $2, $3, $4, $5, FALSE, NOW())`,
          [
            'Incendio Confirmado',
            'CRITICAL',
            `Presencia de humo y temperatura crítica (${memoriaEventos.ultimaTemperatura}°C > ${umbralMaxTemp}°C)`,
            modoId,
            telemetriaId
          ]
        );
        await ejecutarComandoActuador('ACT_SIRENA_01', 'ON', null, 'AUTO_REGLA_INCENDIO');
        await ejecutarComandoActuador('ACT_RELE_01', 'OFF', null, 'AUTO_REGLA_INCENDIO');
      }
    }

    // REGLA 3 (HU8 + HU13): FUGA DE AGUA -> Cierre Electroválvula Hidráulica OFF
    if (sensor === 'agua' && (estado === 'WATER_LEAK' || estado === 'FUGA_DETECTADA')) {
      await query(
        `INSERT INTO AlertaCorrelacionada (titulo, severidad, regla_disparadora, modo_hogar_id, telemetria_origen_id, resuelta, fecha_hora)
         VALUES ($1, $2, $3, $4, $5, FALSE, NOW())`,
        [
          'Fuga de Agua en Piso',
          'WARNING',
          'Contacto hídrico detectado por la sonda resistiva de inundación',
          modoId,
          telemetriaId
        ]
      );
      await ejecutarComandoActuador('ACT_VALVULA_01', 'OFF', null, 'AUTO_REGLA_FUGA');
    }
  } catch (error: any) {
    console.error('[MOTOR DE REGLAS ERROR]:', error.message);
  }
}

export function iniciarServicioMQTT(consume = true) {
  if (client) return;

  const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://mqtt:1883';
  client = mqtt.connect(BROKER_URL, {
    clientId: `homeguard-worker-${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,
  });

  client.on('connect', () => {
    console.log('[MQTT Worker] Conectado al broker:', BROKER_URL);
    if (!consume) return;
    client?.subscribe(['homeguard/+/telemetry', 'homeguard/+/energy', 'homeguard/sensores/#'], (err) => {
      if (err) console.error('[MQTT Worker] Error al suscribirse:', err);
      else console.log('[MQTT Worker] Suscrito a telemetría y canal energético (Sprint 3).');
    });
  });

  client.on('message', async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      const deviceId = data.device_id || 'esp32_central_01';

      // CANAL ENERGÉTICO (HU11 - Sprint 3)
      if (topic.endsWith('/energy')) {
        const voltaje = Number(data.voltaje_v ?? 220.0);
        const corriente = Number(data.corriente_a ?? 0);
        const potencia = Number(data.potencia_w ?? 0);
        const energia = Number(data.energia_kwh ?? 0);

        await query(
          `INSERT INTO ConsumoElectrico (device_id, voltaje_v, corriente_a, potencia_w, energia_kwh)
           VALUES ($1, $2, $3, $4, $5)`,
          [deviceId, voltaje, corriente, potencia, energia]
        );

        // Alerta preventiva por sobrecarga eléctrica (> 3500 W)
        if (potencia > 3500) {
          await query(
            `INSERT INTO AlertaCorrelacionada (titulo, severidad, regla_disparadora, resuelta, fecha_hora)
             VALUES ($1, 'WARNING', $2, FALSE, NOW())`,
            [
              'Sobrecarga Eléctrica Detectada',
              `Potencia instantánea de ${potencia} W supera el umbral seguro de 3500 W`
            ]
          );
        }
        return;
      }

      // CANAL TELEMÉTRICO DE SEGURIDAD Y AMBIENTAL (Sprints 1 y 2)
      const sensorTipo = (data.sensor || 'desconocido').toLowerCase();
      const estado = data.state || data.estado || 'NORMAL';
      const valorNumerico = typeof data.valor === 'number' ? data.valor : null;
      const unidad = data.unidad || null;

      const res = await query(
        `INSERT INTO TelemetriaSensor (device_id, tipo_sensor, valor_numerico, estado_texto, unidad)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [deviceId, sensorTipo, valorNumerico, estado, unidad]
      );

      await evaluarMotorReglas(sensorTipo, estado, valorNumerico, res.rows[0].id);
      await query(`UPDATE DispositivoESP32 SET ultimo_heartbeat = NOW() WHERE device_id = $1`, [deviceId]);
    } catch (err: any) {
      console.error('[MQTT Worker] Error procesando payload:', err.message);
    }
  });

  client.on('error', (err) => console.error('[MQTT Worker Error]:', err));
}
export async function detenerServicioMQTT(){if(client){await client.endAsync();client=null;}}
