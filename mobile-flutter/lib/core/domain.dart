typedef Json = Map<String, dynamic>;
Json obj(dynamic value) => value is Map ? Map<String, dynamic>.from(value) : {};
List<Json> rows(dynamic value) => value is List ? value.map(obj).toList() : [];
String txt(dynamic value, [String fallback = '—']) =>
    value == null ? fallback : value.toString();
int numInt(dynamic value, [int fallback = 0]) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? fallback;
String serverOrigin(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null ||
      !['http', 'https'].contains(uri.scheme) ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      !['', '/'].contains(uri.path)) {
    throw const FormatException(
      'Usá la dirección del servidor sin rutas, por ejemplo http://192.168.1.50:3000',
    );
  }
  if (uri.scheme == 'http' && !isPrivateHost(uri.host)) {
    throw const FormatException(
      'Para servidores fuera de la red del hogar usá HTTPS. HTTP solo se permite para IP privadas o localhost.',
    );
  }
  return uri.origin;
}

bool isPrivateHost(String host) {
  final h = host.toLowerCase();
  if (h == 'localhost' || h == '::1' || h == '[::1]' || h.endsWith('.local')) {
    return true;
  }
  final p = h.split('.').map(int.tryParse).toList();
  if (p.length == 4 && p.every((n) => n != null && n >= 0 && n <= 255)) {
    return p[0] == 10 ||
        p[0] == 127 ||
        p[0] == 192 && p[1] == 168 ||
        p[0] == 172 && p[1]! >= 16 && p[1]! <= 31 ||
        p[0] == 169 && p[1] == 254;
  }
  return h.startsWith('fc') && h.contains(':') ||
      h.startsWith('fd') && h.contains(':') ||
      h.startsWith('fe80:');
}

const labels = <String, String>{
  'NEW': 'Nuevo',
  'ACKNOWLEDGED': 'Revisado',
  'RESOLVED': 'Resuelto',
  'FALSE_POSITIVE': 'Falsa alarma',
  'SECURITY': 'Seguridad',
  'MOVEMENT': 'Movimientos',
  'EMERGENCY': 'Emergencia',
  'SYSTEM': 'Sistema',
  'LIVE': 'En vivo',
  'REPLAY': 'Grabación',
  'SIMULATED': 'Simulación',
  'CRITICAL': 'Crítica',
  'WARNING': 'Atención',
  'INFO': 'Información',
  'ONLINE': 'En línea',
  'OFFLINE': 'Sin conexión',
  'WAITING': 'Esperando datos',
  'DISABLED': 'Deshabilitado',
  'PENDING_RESPONSE': 'Esperando respuesta',
  'CANCELLED': 'Cancelado',
  'CALLING_SIMULATED': 'Llamada simulada',
  'CONNECTED_SIMULATED': 'En atención simulada',
  'CLOSED': 'Cerrado',
  'FAILED': 'Falló',
  'NEEDS_REVIEW': 'Requiere revisión',
  'QUEUED': 'Pendiente',
  'SENT': 'Enviado, pendiente de respuesta',
  'CONFIRMED': 'Confirmado',
  'REQUESTED': 'Solicitado',
  'EXPIRED': 'Venció sin confirmación',
  'READY': 'Disponible',
  'PARTIAL': 'Parcial',
  'PENDING': 'Preparando',
  'UNKNOWN': 'Sin confirmación',
  'HOME': 'En casa',
  'AWAY': 'Ausencia',
  'DISARMED': 'Desarmado',
  'ADMINISTRADOR': 'Administrador',
  'RESIDENTE': 'Residente',
  'INVITADO': 'Invitado',
  'CAMERA': 'Cámara',
  'SENSOR': 'Sensor',
  'ACTUATOR': 'Dispositivo controlable',
  'GATEWAY': 'Equipo con varios sensores',
};
String label(dynamic value) => labels['$value'] ?? txt(value);
String boTime(dynamic value) {
  final date = DateTime.tryParse('$value');
  if (date == null) return 'Sin fecha';
  final b = date.toUtc().subtract(const Duration(hours: 4));
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(b.day)}/${two(b.month)}/${b.year} ${two(b.hour)}:${two(b.minute)}';
}

String readingLabel(Json channel) {
  final value = channel['last_value'];
  if (value == null) return 'Sin lecturas';
  if (value is bool) {
    return channel['type'] == 'DOOR'
        ? (value ? 'Abierta' : 'Cerrada')
        : (value ? 'Detectado' : 'Sin detección');
  }
  if (channel['kind'] == 'ACTUATOR') {
    return value == 'ON' ? 'Encendido informado' : 'Apagado informado';
  }
  return '$value${txt(channel['unit'], '').isEmpty ? '' : ' ${channel['unit']}'}';
}

class NotificationTarget {
  final String kind, id;
  const NotificationTarget(this.kind, this.id);
}

NotificationTarget? notificationTarget(dynamic value) {
  final data = obj(value);
  final pattern = RegExp(
    r'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
    caseSensitive: false,
  );
  for (final entry in {
    'incident_id': 'incident',
    'event_id': 'event',
  }.entries) {
    final id = data[entry.key];
    if (id is String && pattern.hasMatch(id)) {
      return NotificationTarget(entry.value, id);
    }
  }
  return null;
}

class MobileUser {
  final Json data;
  MobileUser(this.data);
  bool get admin => data['rol'] == 'ADMINISTRADOR';
  bool get guest => data['rol'] == 'INVITADO';
  String get name => txt(data['nombre']);
  String get household => txt(data['household_id']);
}

bool allowedNotification(
  Json preferences,
  Json event,
  DateTime now, {
  bool emergencyChallenge = false,
}) {
  if (emergencyChallenge) return preferences['critical_demo_override'] == true;
  if (obj(event['decisions'])['notify_requested'] != true ||
      event['late'] == true) {
    return false;
  }
  if (!((preferences['categories'] as List?) ??
          ['SECURITY', 'MOVEMENT', 'EMERGENCY', 'SYSTEM'])
      .contains(event['category'])) {
    return false;
  }
  final start = preferences['quiet_start'], end = preferences['quiet_end'];
  if (start == null || end == null) return true;
  int minutes(String s) {
    final p = s.split(':');
    return numInt(p[0]) * 60 + numInt(p[1]);
  }

  final bolivia = now.toUtc().subtract(const Duration(hours: 4));
  final current = bolivia.hour * 60 + bolivia.minute,
      s = minutes('$start'),
      e = minutes('$end');
  return !(s == e ||
      (s < e ? current >= s && current < e : current >= s || current < e));
}
