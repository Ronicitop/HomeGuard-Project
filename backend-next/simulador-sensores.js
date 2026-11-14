const mqtt = require('mqtt');

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://broker.emqx.io:1883';
const client = mqtt.connect(BROKER_URL);

const DEVICE_ID = 'esp32_central_01';

client.on('connect', () => {
  const prueba = process.argv[2] || 'normal';

  if (prueba === 'intrusion') {
    console.log('[HU9 + HU13] Probando Intrusión Compuesta (Puerta + Movimiento <15s) -> Activa Sirena...');
    publicarTelemetria('puerta', 'OPEN');
    setTimeout(() => {
      publicarTelemetria('movimiento', 'MOTION_DETECTED');
      cerrar();
    }, 1500);

  } else if (prueba === 'incendio') {
    console.log('[HU9 + HU13] Probando Incendio Confirmado (Humo + Temp 45°C) -> Sirena ON + Corte Eléctrico OFF...');
    publicarTelemetria('humo', 'SMOKE_DETECTED');
    publicarTelemetria('temperatura', 'CRITICAL', 45.0, '°C');
    cerrar();

  } else if (prueba === 'fuga') {
    console.log('[HU8 + HU13] Probando Fuga de Agua -> Cierre automático de Electroválvula...');
    publicarTelemetria('agua', 'WATER_LEAK');
    cerrar();

  } else if (prueba === 'energia') {
    console.log('[HU11 - Sprint 3] Transmitiendo lectura eléctrica nominal...');
    publicarEnergia(221.5, 4.2, 930.3, 18.45);
    cerrar();

  } else if (prueba === 'sobrecarga') {
    console.log('[HU11 - Sprint 3] Simulando Sobrecarga Eléctrica (> 3500 W)...');
    publicarEnergia(218.0, 17.5, 3815.0, 21.10);
    cerrar();

  } else {
    console.log('[Normalización] Transmitiendo régimen seguro de sensores y consumo nominal...');
    publicarTelemetria('puerta', 'CLOSED');
    publicarTelemetria('movimiento', 'NORMAL');
    publicarTelemetria('humo', 'NORMAL');
    publicarTelemetria('agua', 'DRY');
    publicarTelemetria('temperatura', 'NORMAL', 24.0, '°C');
    publicarEnergia(220.4, 3.85, 848.5, 14.62);
    cerrar();
  }
});

function publicarTelemetria(sensor, estado, valor = null, unidad = '') {
  const payload = JSON.stringify({
    device_id: DEVICE_ID,
    sensor: sensor,
    state: estado,
    valor: valor,
    unidad: unidad,
    timestamp: Date.now()
  });

  const topic = `homeguard/${DEVICE_ID}/telemetry`;
  client.publish(topic, payload, { qos: 1 });
  console.log(`[QoS 1 TX] -> ${topic}: ${sensor} = ${estado} (${valor ?? ''})`);
}

function publicarEnergia(voltaje, corriente, potencia, energia) {
  const payload = JSON.stringify({
    device_id: DEVICE_ID,
    voltaje_v: voltaje,
    corriente_a: corriente,
    potencia_w: potencia,
    energia_kwh: energia,
    timestamp: Date.now()
  });

  const topic = `homeguard/${DEVICE_ID}/energy`;
  client.publish(topic, payload, { qos: 1 });
  console.log(`[QoS 1 TX - ENERGY] -> ${topic}: ${voltaje}V | ${corriente}A | ${potencia}W | ${energia}kWh`);
}

function cerrar() {
  setTimeout(() => {
    client.end();
    process.exit(0);
  }, 1000);
}