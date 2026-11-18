import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/domain.dart';
import '../core/session.dart';
import '../ui/shared.dart';
import 'cameras.dart';

Json connectionDefinition(Json c) => {
  for (final key in [
    'name',
    'kind',
    'transport',
    'location',
    'model',
    'enabled',
    'heartbeat_seconds',
    'webcam_device_id',
  ])
    key: c[key],
  'channels': rows(c['channels'])
      .map(
        (ch) => {
          for (final key in ['key', 'name', 'kind', 'type', 'unit'])
            key: ch[key],
        },
      )
      .toList(),
};

class ConnectionsScreen extends StatelessWidget {
  const ConnectionsScreen({super.key});
  @override
  Widget build(BuildContext context) => ResourcePane(
    path: 'connections',
    refreshSeconds: 5,
    builder: (context, data, reload) => PageFrame(
      title: 'Conexiones',
      subtitle: 'Datos y configuración de los equipos existentes.',
      children: [
        const BannerNote(
          'Para agregar cámaras o sensores usá Conexiones en la web. Aquí podés consultar y administrar los que ya existen.',
        ),
        if (rows(obj(data)['items']).isEmpty)
          const Section(
            title: 'Equipos del hogar',
            children: [
              EmptyState(
                title: 'Sin equipos registrados',
                description:
                    'No hay sensores ni cámaras vinculados. No se mostrarán lecturas de ejemplo.',
                icon: Icons.sensors_off_outlined,
              ),
            ],
          ),
        ...rows(
          obj(data)['items'],
        ).map((c) => ConnectionCard(connection: c, configure: true)),
      ],
    ),
  );
}

class ConnectionCard extends StatelessWidget {
  final Json connection;
  final bool configure;
  const ConnectionCard({
    super.key,
    required this.connection,
    this.configure = false,
  });
  @override
  Widget build(BuildContext context) {
    final c = connection,
        session = AppScope.of(context),
        admin = session.user!.admin;
    return Section(
      title: txt(c['name']),
      subtitle: '${label(c['kind'])} · ${txt(c['location'], 'Sin ubicación')}',
      trailing: StatusBadge(c['status']),
      children: [
        Text(
          'Último contacto: ${c['last_seen'] == null ? 'Ninguno' : boTime(c['last_seen'])}',
          style: const TextStyle(color: muted, fontSize: 12),
        ),
        if (c['status'] == 'OFFLINE') ...[
          gap(),
          const BannerNote(
            'Las lecturas conservadas son históricas; el equipo perdió comunicación.',
          ),
        ],
        if (c['kind'] == 'CAMERA') ...[
          gap(),
          OutlinedButton.icon(
            onPressed: () => openPage(
              context,
              txt(c['name']),
              CameraScreen(camera: {'id': c['camera_id'], 'nombre': c['name']}),
            ),
            icon: const Icon(Icons.videocam_outlined),
            label: const Text('Abrir cámara'),
          ),
        ] else
          ...rows(c['channels']).map((channel) {
            final command = obj(channel['last_command']),
                pending = ['QUEUED', 'SENT'].contains(command['status']);
            return Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Divider(),
                  Text(
                    txt(channel['name']),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  gap(5),
                  Text(
                    readingLabel(channel),
                    style: const TextStyle(
                      fontSize: 18,
                      color: brand,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    channel['last_observed_at'] == null
                        ? 'El equipo aún no informó una medición.'
                        : 'Medido: ${boTime(channel['last_observed_at'])}',
                    style: const TextStyle(fontSize: 12, color: muted),
                  ),
                  if (command.isNotEmpty) ...[
                    gap(8),
                    Text(
                      'Solicitud ${txt(command['requested_state'])} · ${command['status'] == 'ACKNOWLEDGED' ? 'Confirmada por el equipo' : label(command['status'])}',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                  if (channel['kind'] == 'ACTUATOR') ...[
                    gap(),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final state in ['ON', 'OFF'])
                          ActionButton(
                            label: state == 'ON'
                                ? 'Solicitar encendido'
                                : 'Solicitar apagado',
                            secondary: true,
                            enabled: c['can_command'] == true && !pending,
                            action: () async {
                              await session.api.post(
                                'connections/${c['id']}/commands',
                                {'channel': channel['key'], 'state': state},
                              );
                              session.invalidate();
                            },
                          ),
                      ],
                    ),
                    if (c['can_command'] != true)
                      const Text(
                        'Se necesita comunicación reciente para enviar órdenes.',
                        style: TextStyle(fontSize: 12, color: muted),
                      ),
                  ],
                ],
              ),
            );
          }),
        if (configure && admin) ...[
          gap(18),
          const Divider(),
          Wrap(
            spacing: 10,
            runSpacing: 6,
            children: [
              TextButton.icon(
                icon: const Icon(Icons.settings_outlined),
                label: const Text('Configurar'),
                onPressed: () async {
                  final result = await showDialog<bool>(
                    context: context,
                    builder: (_) => ConnectionEditor(connection: c),
                  );
                  if (result == true) session.invalidate();
                },
              ),
              ActionButton(
                label: c['enabled'] == true ? 'Deshabilitar' : 'Habilitar',
                secondary: true,
                action: () async {
                  await session.api.patch('connections/${c['id']}', {
                    ...connectionDefinition(c),
                    'enabled': c['enabled'] != true,
                    'expected_revision': c['revision'],
                  });
                  session.invalidate();
                },
              ),
              if (c['kind'] != 'CAMERA')
                ActionButton(
                  label: 'Renovar clave',
                  secondary: true,
                  action: () async {
                    if (!await askConfirmation(
                      context,
                      'Renovar clave',
                      'La clave anterior dejará de funcionar y deberás actualizar el equipo.',
                    )) {
                      return;
                    }
                    final result = obj(
                      await session.api.post(
                        'connections/${c['id']}/credentials',
                        {'expected_revision': c['revision']},
                      ),
                    );
                    session.invalidate();
                    if (!context.mounted) return;
                    final credential = obj(result['credentials']);
                    await showDialog<void>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Guardá la nueva clave'),
                        content: SingleChildScrollView(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text(
                                'Se muestra una sola vez. Compartila solo con quien instala el equipo.',
                              ),
                              gap(),
                              SelectableText(txt(credential['token'])),
                              gap(),
                              Text('Usuario: ${txt(credential['username'])}'),
                              Text(
                                'Ruta HTTP: ${txt(credential['http_path'])}',
                              ),
                              for (final entry in obj(
                                credential['topics'],
                              ).entries)
                                SelectableText('${entry.key}: ${entry.value}'),
                            ],
                          ),
                        ),
                        actions: [
                          TextButton(
                            onPressed: () async {
                              await Clipboard.setData(
                                ClipboardData(text: txt(credential['token'])),
                              );
                              if (ctx.mounted) {
                                showMessage(ctx, 'Clave copiada.');
                              }
                            },
                            child: const Text('Copiar'),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Listo'),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ActionButton(
                label: 'Eliminar vínculo',
                secondary: true,
                danger: true,
                action: () async {
                  if (!await askConfirmation(
                    context,
                    'Eliminar vínculo',
                    'Se revocará el acceso del equipo y se cancelarán sus comandos pendientes. El historial se conserva. Esto no apaga físicamente el equipo.',
                  )) {
                    return;
                  }
                  await session.api.delete('connections/${c['id']}', {
                    'expected_revision': c['revision'],
                  });
                  session.invalidate();
                },
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class ConnectionEditor extends StatefulWidget {
  final Json connection;
  const ConnectionEditor({super.key, required this.connection});
  @override
  State<ConnectionEditor> createState() => _ConnectionEditorState();
}

class _ConnectionEditorState extends State<ConnectionEditor> {
  late final TextEditingController name, location, model, heartbeat;
  late final Json definition;
  late bool enabled;
  bool saving = false;
  String? error;
  final form = GlobalKey<FormState>();
  @override
  void initState() {
    super.initState();
    definition = connectionDefinition(widget.connection);
    name = TextEditingController(text: txt(definition['name'], ''));
    location = TextEditingController(text: txt(definition['location'], ''));
    model = TextEditingController(text: txt(definition['model'], ''));
    heartbeat = TextEditingController(
      text: txt(definition['heartbeat_seconds']),
    );
    enabled = definition['enabled'] == true;
  }

  @override
  void dispose() {
    name.dispose();
    location.dispose();
    model.dispose();
    heartbeat.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    setState(() => saving = true);
    try {
      await AppScope.of(
        context,
      ).api.patch('connections/${widget.connection['id']}', {
        ...definition,
        'name': name.text.trim(),
        'location': location.text.trim(),
        'model': model.text.trim(),
        'enabled': enabled,
        'heartbeat_seconds': numInt(heartbeat.text),
        'expected_revision': widget.connection['revision'],
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !saving,
    child: AlertDialog(
      title: const Text('Configurar equipo existente'),
      content: SingleChildScrollView(
        child: Form(
          key: form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (error != null) BannerNote(error!, error: true),
              TextFormField(
                controller: name,
                enabled: !saving,
                maxLength: 100,
                decoration: const InputDecoration(labelText: 'Nombre'),
                validator: (v) => (v ?? '').trim().length < 2
                    ? 'Ingresá al menos dos caracteres.'
                    : null,
              ),
              gap(),
              TextFormField(
                controller: location,
                enabled: !saving,
                maxLength: 100,
                decoration: const InputDecoration(labelText: 'Ubicación'),
              ),
              gap(),
              ExpansionTile(
                title: const Text('Opciones avanzadas'),
                children: [
                  TextFormField(
                    controller: model,
                    enabled: !saving,
                    maxLength: 100,
                    decoration: const InputDecoration(
                      labelText: 'Modelo / descripción',
                    ),
                  ),
                  gap(),
                  if (definition['kind'] != 'CAMERA')
                    TextFormField(
                      controller: heartbeat,
                      enabled: !saving,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Frecuencia de contacto (segundos)',
                      ),
                      validator: (v) => numInt(v) < 5 || numInt(v) > 3600
                          ? 'Usá un valor entre 5 y 3600.'
                          : null,
                    ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Equipo habilitado'),
                    value: enabled,
                    onChanged: saving
                        ? null
                        : (v) => setState(() => enabled = v),
                  ),
                  const Text(
                    'Los canales y el transporte se conservan. Su preparación técnica y las altas se realizan desde la web.',
                    style: TextStyle(color: muted, fontSize: 12),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: saving ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: saving ? null : save,
          child: Text(saving ? 'Guardando…' : 'Guardar'),
        ),
      ],
    ),
  );
}

class SecurityScreen extends StatelessWidget {
  const SecurityScreen({super.key});
  @override
  Widget build(BuildContext context) => ResourcePane(
    load: (api) async {
      final results = await Future.wait([
        api.get('mode'),
        api.get('connections'),
        api.get('actuators'),
      ]);
      return {
        'mode': results[0],
        'connections': results[1],
        'actuators': results[2],
      };
    },
    refreshSeconds: 5,
    builder: (context, data, reload) {
      final d = obj(data),
          mode = obj(d['mode']),
          connections = rows(obj(d['connections'])['items']),
          session = AppScope.of(context);
      return PageFrame(
        title: 'Seguridad',
        subtitle: 'Protección y estado de los equipos del hogar.',
        children: [
          Section(
            title: 'Modo de protección',
            trailing: StatusBadge(mode['mode']),
            children: [
              for (final entry in {
                'AWAY': 'Ausencia',
                'HOME': 'En casa',
                'DISARMED': 'Desarmado',
              }.entries)
                ActionButton(
                  label: entry.value,
                  icon: entry.key == 'AWAY'
                      ? Icons.shield_outlined
                      : entry.key == 'HOME'
                      ? Icons.home_outlined
                      : Icons.shield_moon_outlined,
                  secondary: mode['mode'] != entry.key,
                  enabled: mode['mode'] != entry.key,
                  action: () async {
                    await session.api.patch('mode', {
                      'mode': entry.key,
                      'expected_revision': mode['revision'],
                    });
                    session.invalidate();
                  },
                ),
            ],
          ),
          if (connections.where((c) => rows(c['channels']).isNotEmpty).isEmpty)
            const Section(
              title: 'Sensores y salidas reales',
              children: [
                EmptyState(
                  title: 'Sin equipos reales vinculados',
                  description:
                      'Cuando tus equipos envíen datos se mostrarán aquí. No hay lecturas ficticias.',
                ),
              ],
            ),
          ...connections
              .where((c) => rows(c['channels']).isNotEmpty)
              .map((c) => ConnectionCard(connection: c)),
          Section(
            title: 'Demostración universitaria',
            subtitle:
                'Estos controles corresponden a un simulador, no a hardware físico.',
            children: [
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: const Text('Ver actuadores simulados'),
                children: [
                  const BannerNote(
                    'El simulador solo funciona si el servidor fue iniciado con -ConSimulador.',
                  ),
                  for (final a in rows(obj(d['actuators'])['items']))
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            '${txt(a['nombre'])} · ${txt(a['estado_actual'])} (simulado)',
                          ),
                          if (a['last_command'] != null)
                            Text(
                              'Último comando: ${label(obj(a['last_command'])['status'])}',
                            ),
                          ActionButton(
                            label: a['estado_actual'] == 'ON'
                                ? 'Solicitar apagado simulado'
                                : 'Solicitar encendido simulado',
                            secondary: true,
                            enabled:
                                obj(a['last_command'])['status'] != 'REQUESTED',
                            action: () async {
                              await session.api.post(
                                'actuators/${a['codigo']}/commands',
                                {
                                  'state': a['estado_actual'] == 'ON'
                                      ? 'OFF'
                                      : 'ON',
                                },
                              );
                              session.invalidate();
                            },
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ],
      );
    },
  );
}
