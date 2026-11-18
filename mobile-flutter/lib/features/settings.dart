import 'package:flutter/material.dart';
import '../core/domain.dart';
import '../core/notifications.dart';
import '../core/session.dart';
import '../ui/shared.dart';

const _categories = ['SECURITY', 'MOVEMENT', 'EMERGENCY', 'SYSTEM'];
const _roles = ['RESIDENTE', 'INVITADO', 'ADMINISTRADOR'];

class SettingsScreen extends StatelessWidget {
  final MobileNotifications notifications;
  const SettingsScreen({super.key, required this.notifications});

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    final user = session.user!;
    return PageFrame(
      title: 'Configuración',
      subtitle: 'Tu cuenta, los avisos y el acceso al hogar.',
      children: [
        Section(
          title: 'Mi cuenta',
          children: [
            Text(user.name, style: Theme.of(context).textTheme.titleLarge),
            gap(8),
            badges([user.data['rol']]),
            gap(),
            Text(session.api.origin, style: const TextStyle(color: muted)),
            gap(6),
            const Text(
              'La dirección del servidor se puede cambiar al iniciar sesión.',
            ),
          ],
        ),
        if (!user.guest) ...[
          ResourcePane(
            path: 'notification-preferences',
            refreshSeconds: 0,
            builder: (context, data, reload) {
              final preferences = obj(data);
              final selected =
                  (preferences['categories'] as List?) ?? _categories;
              return Section(
                title: 'Avisos y horarios',
                subtitle: 'Se aplican a tu cuenta. Horario de Bolivia.',
                children: [
                  if (selected.isEmpty)
                    const Text('No seleccionaste categorías de avisos.')
                  else
                    badges(selected),
                  gap(),
                  Text(
                    preferences['quiet_start'] == null
                        ? 'Sin horario silencioso'
                        : 'Silencio: ${preferences['quiet_start']} a ${preferences['quiet_end']}',
                  ),
                  gap(8),
                  Text(
                    preferences['critical_demo_override'] == true
                        ? 'Solicitudes de respuesta de emergencias simuladas permitidas fuera del horario.'
                        : 'Las solicitudes de respuesta de emergencias simuladas fuera del horario están desactivadas.',
                  ),
                  gap(),
                  ActionButton(
                    label: 'Editar preferencias',
                    icon: Icons.tune,
                    secondary: true,
                    action: () async {
                      final saved = await showDialog<bool>(
                        context: context,
                        barrierDismissible: false,
                        builder: (_) =>
                            PreferencesEditor(preferences: preferences),
                      );
                      if (saved == true) reload();
                    },
                  ),
                ],
              );
            },
          ),
          ListenableBuilder(
            listenable: notifications,
            builder: (context, _) => Section(
              title: 'Notificaciones en este teléfono',
              children: [
                BannerNote(notifications.status),
                ActionButton(
                  label: notifications.enabled
                      ? 'Desactivar notificaciones'
                      : 'Habilitar notificaciones',
                  icon: notifications.enabled
                      ? Icons.notifications_off_outlined
                      : Icons.notifications_active_outlined,
                  secondary: notifications.enabled,
                  action: () async {
                    if (notifications.enabled) {
                      await notifications.disable();
                    } else {
                      await notifications.enable();
                    }
                    session.invalidate();
                  },
                ),
                const Text(
                  'El teléfono necesita Internet para recibir avisos push. El historial y los videos requieren conexión con el servidor del hogar.',
                  style: TextStyle(color: muted),
                ),
              ],
            ),
          ),
          ResourcePane(
            path: 'push-devices',
            builder: (context, data, reload) {
              final devices = rows(
                obj(data)['items'],
              ).where((d) => d['enabled'] == true).toList();
              return Section(
                title: 'Dispositivos vinculados',
                subtitle: '${devices.length} activos en tu cuenta',
                children: [
                  if (devices.isEmpty)
                    const EmptyState(
                      title: 'Sin dispositivos vinculados',
                      description:
                          'Habilitá las notificaciones para vincular este teléfono.',
                      icon: Icons.smartphone_outlined,
                    ),
                  for (final device in devices)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.smartphone, color: brand),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  '${txt(device['platform'])} · ${_shortId(device['installation_id'])}',
                                ),
                              ),
                              if (device['installation_id'] ==
                                  notifications.installationId)
                                const StatusBadge('Este teléfono'),
                            ],
                          ),
                          gap(6),
                          ActionButton(
                            label: 'Desvincular',
                            secondary: true,
                            action: () async {
                              final confirmed = await askConfirmation(
                                context,
                                'Desvincular dispositivo',
                                'Dejará de recibir los avisos de esta cuenta. Podés volver a vincularlo desde ese teléfono.',
                              );
                              if (!confirmed) return;
                              if (device['installation_id'] ==
                                  notifications.installationId) {
                                await notifications.disable();
                              } else {
                                await session.api.delete('push-devices', {
                                  'installation_id': device['installation_id'],
                                });
                              }
                              reload();
                              session.invalidate();
                            },
                          ),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
          ResourcePane(
            path: 'health',
            refreshSeconds: 15,
            builder: (context, data, reload) {
              final health = obj(data),
                  integrations = obj(obj(data)['integrations']);
              final services = rows(health['services']);
              return Section(
                title: 'Estado de servicios',
                subtitle:
                    'Los eventos guardados siguen disponibles si un servicio se desconecta.',
                trailing: IconButton(
                  onPressed: reload,
                  tooltip: 'Actualizar estado',
                  icon: const Icon(Icons.refresh),
                ),
                children: [
                  _service('Base de datos', health['database']),
                  _service(
                    'Cámaras y evidencia',
                    integrations['vision'] == true ? 'ONLINE' : 'OFFLINE',
                  ),
                  for (final service in services)
                    _service(
                      service['name'] == 'event-processor'
                          ? 'Procesador de eventos'
                          : txt(service['name']),
                      service['status'],
                      lastSeen: service['last_seen'],
                    ),
                  if (!services.any((s) => s['name'] == 'event-processor'))
                    _service('Procesador de eventos', 'OFFLINE'),
                  _service(
                    'Servicio de avisos',
                    integrations['push'] == true
                        ? 'Habilitado en servidor'
                        : 'Pendiente de configuración',
                  ),
                  Text('Trabajos pendientes: ${txt(health['pending_jobs'])}'),
                ],
              );
            },
          ),
        ],
        if (user.admin)
          ResourcePane(
            path: 'members',
            refreshSeconds: 0,
            builder: (context, data, reload) {
              final members = rows(obj(data)['items']);
              return Section(
                title: 'Miembros del hogar',
                subtitle:
                    'Los cambios de acceso revocan las sesiones anteriores.',
                children: [
                  if (members.isEmpty)
                    const EmptyState(
                      title: 'Sin miembros disponibles',
                      description:
                          'Actualizá la lista para consultar los accesos.',
                    ),
                  for (final member in members)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            '${txt(member['nombre'])} ${txt(member['apellido'])}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            txt(member['email']),
                            style: const TextStyle(color: muted),
                          ),
                          gap(8),
                          badges([
                            member['role'],
                            member['enabled'] == true
                                ? 'Acceso activo'
                                : 'Acceso desactivado',
                          ]),
                          gap(8),
                          ActionButton(
                            label: 'Editar acceso',
                            secondary: true,
                            icon: Icons.manage_accounts_outlined,
                            action: () async {
                              final saved = await showDialog<bool>(
                                context: context,
                                barrierDismissible: false,
                                builder: (_) => MemberEditor(member: member),
                              );
                              if (saved == true) reload();
                            },
                          ),
                        ],
                      ),
                    ),
                  ActionButton(
                    label: 'Registrar miembro',
                    icon: Icons.person_add_alt,
                    action: () async {
                      final saved = await showDialog<bool>(
                        context: context,
                        barrierDismissible: false,
                        builder: (_) => const MemberEditor(),
                      );
                      if (saved == true) reload();
                    },
                  ),
                ],
              );
            },
          ),
        if (user.guest)
          const BannerNote(
            'Tu acceso de invitado permite consultar el resumen del hogar. Un administrador puede actualizar tus permisos.',
          ),
        Section(
          title: 'Sesión',
          children: [
            ActionButton(
              label: 'Cerrar sesión',
              icon: Icons.logout,
              secondary: true,
              action: () async {
                if (!await askConfirmation(
                  context,
                  'Cerrar sesión',
                  'Se cerrará tu acceso a este hogar en la aplicación.',
                )) {
                  return;
                }
                await session.signOut(
                  installationId: notifications.installationId,
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

String _shortId(dynamic value) {
  final id = txt(value);
  return id.length > 8 ? id.substring(id.length - 8) : id;
}

Widget _service(String name, dynamic status, {dynamic lastSeen}) => Padding(
  padding: const EdgeInsets.only(bottom: 14),
  child: Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(name),
            if (lastSeen != null)
              Text(
                boTime(lastSeen),
                style: const TextStyle(color: muted, fontSize: 12),
              ),
          ],
        ),
      ),
      const SizedBox(width: 8),
      Flexible(child: StatusBadge(status ?? 'UNKNOWN')),
    ],
  ),
);

class PreferencesEditor extends StatefulWidget {
  final Json preferences;
  const PreferencesEditor({super.key, required this.preferences});
  @override
  State<PreferencesEditor> createState() => _PreferencesEditorState();
}

class _PreferencesEditorState extends State<PreferencesEditor> {
  final form = GlobalKey<FormState>();
  late final TextEditingController start, end;
  late Set<String> categories;
  late bool critical;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    start = TextEditingController(
      text: txt(widget.preferences['quiet_start'], ''),
    );
    end = TextEditingController(text: txt(widget.preferences['quiet_end'], ''));
    categories = ((widget.preferences['categories'] as List?) ?? _categories)
        .map((v) => '$v')
        .toSet();
    critical = widget.preferences['critical_demo_override'] == true;
  }

  @override
  void dispose() {
    start.dispose();
    end.dispose();
    super.dispose();
  }

  String? validateTime(String? value) {
    if (start.text.trim().isEmpty != end.text.trim().isEmpty) {
      return 'Completá ambos horarios o dejalos vacíos.';
    }
    if (value != null &&
        value.trim().isNotEmpty &&
        !RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(value.trim())) {
      return 'Usá el formato HH:mm, por ejemplo 22:00.';
    }
    return null;
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    final session = AppScope.of(context);
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await session.api.patch('notification-preferences', {
        'categories': _categories.where(categories.contains).toList(),
        'quiet_start': start.text.trim().isEmpty ? null : start.text.trim(),
        'quiet_end': end.text.trim().isEmpty ? null : end.text.trim(),
        'critical_demo_override': critical,
        'expected_revision': numInt(widget.preferences['revision']),
      });
      session.invalidate();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: AlertDialog(
      title: const Text('Avisos y horarios'),
      scrollable: true,
      content: SizedBox(
        width: 480,
        child: Form(
          key: form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (error != null) BannerNote(error!, error: true),
              for (final category in _categories)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(label(category)),
                  value: categories.contains(category),
                  onChanged: busy
                      ? null
                      : (checked) => setState(() {
                          if (checked == true) {
                            categories.add(category);
                          } else {
                            categories.remove(category);
                          }
                        }),
                ),
              gap(),
              TextFormField(
                controller: start,
                enabled: !busy,
                decoration: const InputDecoration(
                  labelText: 'Silencio desde',
                  hintText: '22:00',
                ),
                keyboardType: TextInputType.datetime,
                validator: validateTime,
              ),
              gap(),
              TextFormField(
                controller: end,
                enabled: !busy,
                decoration: const InputDecoration(
                  labelText: 'Silencio hasta',
                  hintText: '07:00',
                ),
                keyboardType: TextInputType.datetime,
                validator: validateTime,
              ),
              gap(8),
              const Text(
                'Horario de Bolivia. Dejá ambos campos vacíos para recibir avisos en cualquier horario.',
                style: TextStyle(color: muted),
              ),
              gap(),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Solicitudes de respuesta fuera de horario'),
                subtitle: const Text(
                  'Permitir emergencias simuladas fuera de mis horarios.',
                ),
                value: critical,
                onChanged: busy
                    ? null
                    : (value) => setState(() => critical = value),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: busy ? null : () => Navigator.pop(context, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: busy ? null : save,
          child: Text(busy ? 'Guardando…' : 'Guardar preferencias'),
        ),
      ],
    ),
  );
}

class MemberEditor extends StatefulWidget {
  final Json? member;
  const MemberEditor({super.key, this.member});
  @override
  State<MemberEditor> createState() => _MemberEditorState();
}

class _MemberEditorState extends State<MemberEditor> {
  final form = GlobalKey<FormState>();
  final first = TextEditingController(),
      last = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController();
  late String role;
  late bool enabled;
  bool busy = false, reveal = false;
  String? error;
  bool get creating => widget.member == null;
  @override
  void initState() {
    super.initState();
    role = txt(widget.member?['role'], 'RESIDENTE');
    enabled = widget.member?['enabled'] == true;
  }

  @override
  void dispose() {
    first.dispose();
    last.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    final session = AppScope.of(context);
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (creating) {
        await session.api.post('members', {
          'nombre': first.text.trim(),
          'apellido': last.text.trim(),
          'email': email.text.trim(),
          'password': password.text,
          'role': role,
        });
      } else {
        await session.api.patch('members/${widget.member!['id']}', {
          'role': role,
          'enabled': enabled,
          'expected_revision': numInt(widget.member!['revision']),
        });
      }
      session.invalidate();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: AlertDialog(
      title: Text(creating ? 'Registrar miembro' : 'Editar acceso'),
      scrollable: true,
      content: SizedBox(
        width: 480,
        child: Form(
          key: form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (error != null) BannerNote(error!, error: true),
              if (creating) ...[
                TextFormField(
                  controller: first,
                  enabled: !busy,
                  maxLength: 100,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Nombre'),
                  validator: (value) => (value ?? '').trim().length < 2
                      ? 'Ingresá al menos 2 caracteres.'
                      : null,
                ),
                gap(),
                TextFormField(
                  controller: last,
                  enabled: !busy,
                  maxLength: 100,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Apellido'),
                  validator: (value) => (value ?? '').trim().length < 2
                      ? 'Ingresá al menos 2 caracteres.'
                      : null,
                ),
                gap(),
                TextFormField(
                  controller: email,
                  enabled: !busy,
                  maxLength: 150,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'Correo'),
                  validator: (value) =>
                      !RegExp(
                        r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                      ).hasMatch((value ?? '').trim())
                      ? 'Ingresá un correo válido.'
                      : null,
                ),
                gap(),
                TextFormField(
                  controller: password,
                  enabled: !busy,
                  maxLength: 1024,
                  obscureText: !reveal,
                  enableSuggestions: false,
                  autocorrect: false,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: InputDecoration(
                    labelText: 'Contraseña inicial',
                    suffixIcon: IconButton(
                      tooltip: reveal
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña',
                      onPressed: busy
                          ? null
                          : () => setState(() => reveal = !reveal),
                      icon: Icon(
                        reveal
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                      ),
                    ),
                  ),
                  validator: (value) => (value ?? '').length < 10
                      ? 'Usá al menos 10 caracteres.'
                      : null,
                ),
                gap(),
              ] else ...[
                Text(
                  '${txt(widget.member!['nombre'])} ${txt(widget.member!['apellido'])}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(txt(widget.member!['email'])),
                gap(),
                const BannerNote(
                  'Guardar cambios revocará las sesiones anteriores de esta persona. El hogar debe conservar un administrador activo.',
                ),
              ],
              DropdownButtonFormField<String>(
                initialValue: role,
                decoration: const InputDecoration(labelText: 'Rol'),
                items: _roles
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text(label(value)),
                      ),
                    )
                    .toList(),
                onChanged: busy
                    ? null
                    : (value) => setState(() => role = value!),
              ),
              if (!creating)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Acceso al hogar'),
                  subtitle: Text(enabled ? 'Activo' : 'Desactivado'),
                  value: enabled,
                  onChanged: busy
                      ? null
                      : (value) => setState(() => enabled = value),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: busy ? null : () => Navigator.pop(context, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: busy ? null : save,
          child: Text(
            busy
                ? 'Guardando…'
                : creating
                ? 'Registrar miembro'
                : 'Guardar acceso',
          ),
        ),
      ],
    ),
  );
}
