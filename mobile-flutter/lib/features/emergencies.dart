import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../core/domain.dart';
import '../core/session.dart';
import '../ui/shared.dart';
import 'events.dart';

const _simulationNotice =
    'Central de demostración: todas las llamadas son simuladas. No realiza llamadas a servicios de emergencia reales. Una posible caída es una observación, no un diagnóstico médico.';

class EmergenciesScreen extends StatelessWidget {
  const EmergenciesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = AppScope.of(context).user;
    if (user == null || user.guest) return const _Denied();
    return PageFrame(
      title: 'Emergencias',
      subtitle: 'Cuidado y respuesta en situaciones de prueba.',
      children: [
        const BannerNote(_simulationNotice),
        if (user.admin)
          OutlinedButton.icon(
            icon: const Icon(Icons.headset_mic_outlined),
            label: const Text('Abrir central simulada'),
            onPressed: () =>
                openPage(context, 'Central simulada', const OperatorScreen()),
          ),
        gap(),
        ResourcePane(
          path: 'emergencies',
          refreshSeconds: 5,
          builder: (context, data, reload) {
            final incidents = rows(obj(data)['items']);
            return Section(
              title: 'Incidentes recientes',
              subtitle: 'Los plazos y estados se mantienen en el servidor.',
              children: [
                if (incidents.isEmpty)
                  const EmptyState(
                    title: 'Sin incidentes registrados',
                    description:
                        'Los incidentes aparecerán aquí para revisar y responder.',
                    icon: Icons.health_and_safety_outlined,
                  ),
                for (final incident in incidents)
                  _IncidentTile(incident: incident),
              ],
            );
          },
        ),
        if (user.admin) const _EmergencyConfiguration(),
      ],
    );
  }
}

class _Denied extends StatelessWidget {
  const _Denied();
  @override
  Widget build(BuildContext context) => const PageFrame(
    title: 'Acceso restringido',
    children: [
      BannerNote(
        'Tu cuenta no tiene permiso para acceder a esta sección.',
        error: true,
      ),
    ],
  );
}

class _IncidentTile extends StatelessWidget {
  final Json incident;
  final VoidCallback? onTap;
  const _IncidentTile({required this.incident, this.onTap});
  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: const Icon(Icons.monitor_heart_outlined, color: brand),
    title: const Text('Posible caída · Demostración'),
    subtitle: Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(boTime(incident['created_at'])),
          gap(6),
          StatusBadge(incident['state']),
        ],
      ),
    ),
    trailing: const Icon(Icons.chevron_right),
    onTap:
        onTap ??
        () => openPage(
          context,
          'Incidente',
          IncidentScreen(id: txt(incident['id'])),
        ),
  );
}

class _EmergencyConfiguration extends StatefulWidget {
  const _EmergencyConfiguration();
  @override
  State<_EmergencyConfiguration> createState() =>
      _EmergencyConfigurationState();
}

class _EmergencyConfigurationState extends State<_EmergencyConfiguration> {
  SessionController? session;
  Json? profile, policy;
  String? error;
  bool loading = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = AppScope.of(context);
    if (session != next) {
      session = next;
      _load();
    }
  }

  Future<void> _load() async {
    if (loading || session?.user?.admin != true) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final values = await Future.wait([
        session!.api.get('emergency-profile'),
        session!.api.get('emergency-policy'),
      ]);
      if (!mounted) return;
      setState(() {
        profile = obj(values[0]);
        policy = obj(values[1]);
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (AppScope.of(context).user?.admin != true) {
      return const SizedBox.shrink();
    }
    if (profile == null || policy == null) {
      return Section(
        title: 'Configuración de demostración',
        children: [
          if (loading) const Center(child: CircularProgressIndicator()),
          if (error != null) BannerNote(error!, error: true),
          if (!loading)
            ActionButton(
              label: 'Volver a cargar',
              action: _load,
              secondary: true,
            ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ProfileEditor(initial: profile!),
        _PolicyEditor(
          initial: policy!,
          onSaved: (value) => setState(() => policy = value),
        ),
        Section(
          title: 'Prueba de posible caída',
          children: [
            const Text(
              'Registra un evento ficticio. El servidor revisa las reglas y la política antes de abrir un incidente.',
            ),
            gap(),
            ActionButton(
              label: 'Simular posible caída',
              icon: Icons.science_outlined,
              enabled: policy!['enabled'] == true,
              action: () async {
                if (AppScope.of(context).user?.admin != true) return;
                await session!.api.post('demo/events', {
                  'scenario': 'POSSIBLE_FALL',
                  'notify_enabled': true,
                  'save_clip_enabled': false,
                });
                session!.invalidate();
                if (context.mounted) {
                  showMessage(
                    context,
                    'Posible caída simulada registrada. El servidor revisará la política de respuesta.',
                  );
                }
              },
            ),
            if (policy!['enabled'] != true)
              const Text(
                'Guardá primero un perfil ficticio y habilitá el escalamiento simulado.',
              ),
          ],
        ),
      ],
    );
  }
}

class _ContactDraft {
  final TextEditingController name, phone;
  _ContactDraft(Json data)
    : name = TextEditingController(text: txt(data['name'], '')),
      phone = TextEditingController(text: txt(data['phone'], ''));
  void dispose() {
    name.dispose();
    phone.dispose();
  }
}

class _ProfileEditor extends StatefulWidget {
  final Json initial;
  const _ProfileEditor({required this.initial});
  @override
  State<_ProfileEditor> createState() => _ProfileEditorState();
}

class _ProfileEditorState extends State<_ProfileEditor> {
  final form = GlobalKey<FormState>();
  late final TextEditingController name, address, notes;
  late List<_ContactDraft> contacts;
  late int revision;
  late bool confirmed;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    name = TextEditingController(text: txt(widget.initial['contact_name'], ''));
    address = TextEditingController(text: txt(widget.initial['address'], ''));
    notes = TextEditingController(
      text: txt(widget.initial['access_notes'], ''),
    );
    contacts = rows(widget.initial['contacts']).map(_ContactDraft.new).toList();
    revision = numInt(widget.initial['revision']);
    confirmed = widget.initial['fictitious_data_confirmed'] == true;
  }

  @override
  void dispose() {
    name.dispose();
    address.dispose();
    notes.dispose();
    for (final contact in contacts) {
      contact.dispose();
    }
    super.dispose();
  }

  String? _minimum(String? value, int min) => (value ?? '').trim().length < min
      ? 'Ingresá al menos $min caracteres.'
      : null;

  Future<void> _save() async {
    final session = AppScope.of(context);
    if (session.user?.admin != true ||
        !form.currentState!.validate() ||
        !confirmed) {
      return;
    }
    setState(() => saving = true);
    try {
      final saved = obj(
        await session.api.put('emergency-profile', {
          'contact_name': name.text.trim(),
          'address': address.text.trim(),
          'access_notes': notes.text,
          'contacts': contacts
              .map(
                (c) => {
                  'name': c.name.text.trim(),
                  'phone': c.phone.text.trim(),
                },
              )
              .toList(),
          'fictitious_data_confirmed': true,
          'expected_revision': revision,
        }),
      );
      if (!mounted) return;
      setState(() => revision = numInt(saved['revision']));
      session.invalidate();
      showMessage(context, 'Perfil de demostración guardado.');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _reload() async {
    if (!await askConfirmation(
      context,
      'Recargar perfil',
      'Se descartarán los cambios sin guardar de este perfil.',
    )) {
      return;
    }
    if (!mounted) return;
    final saved = obj(await AppScope.of(context).api.get('emergency-profile'));
    if (!mounted) return;
    final oldContacts = contacts;
    setState(() {
      name.text = txt(saved['contact_name'], '');
      address.text = txt(saved['address'], '');
      notes.text = txt(saved['access_notes'], '');
      contacts = rows(saved['contacts']).map(_ContactDraft.new).toList();
      revision = numInt(saved['revision']);
      confirmed = saved['fictitious_data_confirmed'] == true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final c in oldContacts) {
        c.dispose();
      }
    });
  }

  @override
  Widget build(BuildContext context) => Section(
    title: 'Perfil de demostración',
    subtitle: 'Usá datos ficticios. Hasta cinco contactos de prueba.',
    children: [
      Form(
        key: form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: name,
              enabled: !saving,
              maxLength: 100,
              decoration: const InputDecoration(
                labelText: 'Responsable de prueba',
              ),
              validator: (v) => _minimum(v, 2),
            ),
            gap(),
            TextFormField(
              controller: address,
              enabled: !saving,
              maxLength: 300,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Dirección ficticia',
              ),
              validator: (v) => _minimum(v, 5),
            ),
            gap(),
            TextFormField(
              controller: notes,
              enabled: !saving,
              maxLength: 500,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Referencias de acceso',
              ),
            ),
            for (var index = 0; index < contacts.length; index++) ...[
              gap(),
              Row(
                children: [
                  Expanded(child: Text('Contacto ${index + 1}')),
                  IconButton(
                    tooltip: 'Quitar contacto',
                    onPressed: saving
                        ? null
                        : () {
                            final removed = contacts[index];
                            setState(() => contacts.removeAt(index));
                            WidgetsBinding.instance.addPostFrameCallback(
                              (_) => removed.dispose(),
                            );
                          },
                    icon: const Icon(Icons.remove_circle_outline),
                  ),
                ],
              ),
              TextFormField(
                key: ObjectKey(contacts[index].name),
                controller: contacts[index].name,
                enabled: !saving,
                maxLength: 100,
                decoration: const InputDecoration(labelText: 'Nombre ficticio'),
                validator: (v) => _minimum(v, 2),
              ),
              gap(),
              TextFormField(
                key: ObjectKey(contacts[index].phone),
                controller: contacts[index].phone,
                enabled: !saving,
                maxLength: 40,
                decoration: const InputDecoration(
                  labelText: 'Identificador ficticio',
                  hintText: 'DEMO-001',
                ),
                validator: (v) => _minimum(v, 3),
              ),
            ],
            if (contacts.length < 5)
              OutlinedButton.icon(
                onPressed: saving
                    ? null
                    : () => setState(() => contacts.add(_ContactDraft({}))),
                icon: const Icon(Icons.add),
                label: const Text('Agregar contacto de prueba'),
              ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: confirmed,
              onChanged: saving
                  ? null
                  : (v) => setState(() => confirmed = v == true),
              title: const Text(
                'Confirmo que estos datos son ficticios y corresponden a una demostración.',
              ),
            ),
            ActionButton(
              label: 'Guardar perfil',
              icon: Icons.save_outlined,
              action: _save,
              enabled: confirmed && !saving,
            ),
            ActionButton(
              label: 'Recargar perfil del servidor',
              action: _reload,
              enabled: !saving,
              secondary: true,
            ),
          ],
        ),
      ),
    ],
  );
}

class _PolicyEditor extends StatefulWidget {
  final Json initial;
  final ValueChanged<Json> onSaved;
  const _PolicyEditor({required this.initial, required this.onSaved});
  @override
  State<_PolicyEditor> createState() => _PolicyEditorState();
}

class _PolicyEditorState extends State<_PolicyEditor> {
  final form = GlobalKey<FormState>();
  late final TextEditingController immobility, response;
  late bool enabled;
  late int revision;
  bool saving = false;
  @override
  void initState() {
    super.initState();
    immobility = TextEditingController(
      text: '${numInt(widget.initial['immobility_seconds'], 10)}',
    );
    response = TextEditingController(
      text: '${numInt(widget.initial['response_seconds'], 20)}',
    );
    enabled = widget.initial['enabled'] == true;
    revision = numInt(widget.initial['revision']);
  }

  @override
  void dispose() {
    immobility.dispose();
    response.dispose();
    super.dispose();
  }

  String? _range(String? value, int min, int max) {
    final n = int.tryParse(value ?? '');
    return n == null || n < min || n > max
        ? 'Ingresá un entero entre $min y $max.'
        : null;
  }

  Future<void> _save() async {
    final session = AppScope.of(context);
    if (session.user?.admin != true || !form.currentState!.validate()) return;
    if (!enabled &&
        !await askConfirmation(
          context,
          'Deshabilitar escalamiento',
          'Se cancelarán avisos pendientes y los incidentes pendientes pasarán a revisión.',
        )) {
      return;
    }
    if (!mounted) return;
    setState(() => saving = true);
    try {
      final saved = obj(
        await session.api.put('emergency-policy', {
          'enabled': enabled,
          'immobility_seconds': int.parse(immobility.text),
          'response_seconds': int.parse(response.text),
          'transport': 'SIMULATED',
          'expected_revision': revision,
        }),
      );
      if (!mounted) return;
      setState(() => revision = numInt(saved['revision']));
      widget.onSaved(saved);
      session.invalidate();
      showMessage(context, 'Política de respuesta guardada.');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _reload() async {
    if (!await askConfirmation(
      context,
      'Recargar política',
      'Se descartarán los cambios sin guardar de esta política.',
    )) {
      return;
    }
    if (!mounted) return;
    final saved = obj(await AppScope.of(context).api.get('emergency-policy'));
    if (!mounted) return;
    setState(() {
      enabled = saved['enabled'] == true;
      revision = numInt(saved['revision']);
      immobility.text = '${numInt(saved['immobility_seconds'], 10)}';
      response.text = '${numInt(saved['response_seconds'], 20)}';
    });
    widget.onSaved(saved);
  }

  @override
  Widget build(BuildContext context) => Section(
    title: 'Política de respuesta',
    subtitle: 'Parámetros de práctica sin uso clínico.',
    children: [
      const BannerNote(
        'Guardá primero un perfil ficticio confirmado. Revisá las reglas visuales cuando cambies el umbral de inmovilidad.',
      ),
      Form(
        key: form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Escalamiento simulado'),
              value: enabled,
              onChanged: saving ? null : (v) => setState(() => enabled = v),
            ),
            TextFormField(
              controller: immobility,
              enabled: !saving,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Inmovilidad observada (5–120 segundos)',
              ),
              validator: (v) => _range(v, 5, 120),
            ),
            gap(),
            TextFormField(
              controller: response,
              enabled: !saving,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Plazo para responder (10–300 segundos)',
              ),
              validator: (v) => _range(v, 10, 300),
            ),
            gap(),
            const Text(
              'Transporte: SIMULATED. Tras un reinicio, un plazo vencido requiere revisión y no inicia una llamada histórica automática.',
            ),
            gap(),
            ActionButton(
              label: 'Guardar política',
              action: _save,
              enabled: !saving,
              icon: Icons.save_outlined,
            ),
            ActionButton(
              label: 'Recargar política del servidor',
              action: _reload,
              enabled: !saving,
              secondary: true,
            ),
          ],
        ),
      ),
    ],
  );
}

class IncidentScreen extends StatelessWidget {
  final String id;
  const IncidentScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context) {
    final user = AppScope.of(context).user;
    if (user == null || user.guest) return const _Denied();
    return PageFrame(
      title: 'Posible caída',
      subtitle: 'Respuesta al incidente de demostración.',
      children: [
        const BannerNote(_simulationNotice),
        _IncidentPanel(id: id),
      ],
    );
  }
}

class OperatorScreen extends StatefulWidget {
  const OperatorScreen({super.key});
  @override
  State<OperatorScreen> createState() => _OperatorScreenState();
}

class _OperatorScreenState extends State<OperatorScreen> {
  String? selected;
  @override
  Widget build(BuildContext context) {
    if (AppScope.of(context).user?.admin != true) return const _Denied();
    return PageFrame(
      title: 'Central simulada',
      subtitle: 'Consola de operador de práctica.',
      children: [
        const BannerNote(_simulationNotice),
        const BannerNote(
          'Esta pantalla no representa a un servicio público ni confirma el envío de asistencia.',
        ),
        ResourcePane(
          path: 'emergencies',
          refreshSeconds: 3,
          builder: (context, data, reload) {
            final items = rows(obj(data)['items'])
                .where(
                  (i) => [
                    'CALLING_SIMULATED',
                    'CONNECTED_SIMULATED',
                    'NEEDS_REVIEW',
                    'FAILED',
                  ].contains(i['state']),
                )
                .toList();
            return Section(
              title: 'Avisos para atender',
              subtitle: '${items.length} incidentes',
              children: [
                if (items.isEmpty)
                  const EmptyState(
                    title: 'La central está a la escucha',
                    description:
                        'Los avisos simulados aparecerán aquí al escalar.',
                    icon: Icons.headset_mic_outlined,
                  ),
                for (final item in items)
                  _IncidentTile(
                    incident: item,
                    onTap: () => setState(() => selected = txt(item['id'])),
                  ),
              ],
            );
          },
        ),
        if (selected != null)
          _IncidentPanel(key: ValueKey(selected), id: selected!, operator: true)
        else
          const Section(
            title: 'Atención del incidente',
            children: [
              EmptyState(
                title: 'Seleccioná un aviso',
                description:
                    'Podrás revisar el mensaje automatizado y atender la llamada simulada.',
              ),
            ],
          ),
      ],
    );
  }
}

// Retains the current detail while polling so audio and user actions survive refreshes.
class _IncidentPanel extends StatefulWidget {
  final String id;
  final bool operator;
  const _IncidentPanel({super.key, required this.id, this.operator = false});
  @override
  State<_IncidentPanel> createState() => _IncidentPanelState();
}

class _IncidentPanelState extends State<_IncidentPanel>
    with WidgetsBindingObserver {
  SessionController? session;
  Timer? timer, ticker;
  Json? incident;
  String? error;
  bool fetching = false, busy = false, active = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (active) _load();
    });
    ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && active && incident?['state'] == 'PENDING_RESPONSE') {
        setState(() {});
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = AppScope.of(context);
    if (session != next) {
      session?.refresh.removeListener(_load);
      session = next;
      session!.refresh.addListener(_load);
      _load();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    active = state == AppLifecycleState.resumed;
    if (active) _load();
  }

  Future<void> _load() async {
    if (fetching || busy || session?.user == null || session!.user!.guest) {
      return;
    }
    fetching = true;
    try {
      final result = obj(await session!.api.get('emergencies/${widget.id}'));
      if (mounted) {
        setState(() {
          // A read started before a response may complete after the mutation.
          if (incident == null ||
              numInt(result['state_revision']) >=
                  numInt(incident!['state_revision'])) {
            incident = result;
          }
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      fetching = false;
    }
  }

  Future<void> _action(String action) async {
    if (incident == null || busy) return;
    final user = session?.user;
    if (user == null || user.guest || (widget.operator && !user.admin)) return;
    final revision = numInt(incident!['state_revision']);
    setState(() => busy = true);
    try {
      final path = action == 'accept'
          ? 'simulated-call/accept'
          : action == 'close'
          ? 'close'
          : 'respond';
      final result = await session!.api.post('emergencies/${widget.id}/$path', {
        'expected_revision': revision,
        if (path == 'respond') 'response': action,
      });
      if (mounted) {
        setState(() {
          incident = obj(result);
          error = null;
        });
      }
      session!.invalidate();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
      _load();
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    ticker?.cancel();
    session?.refresh.removeListener(_load);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (incident == null) {
      return Section(
        title: 'Detalle del incidente',
        children: [
          if (error != null) ...[
            BannerNote(error!, error: true),
            ActionButton(
              label: 'Volver a intentar',
              action: _load,
              secondary: true,
            ),
          ] else
            const Center(child: CircularProgressIndicator()),
        ],
      );
    }
    final i = incident!, state = txt(i['state']);
    final deadline = DateTime.tryParse(txt(i['response_deadline'], ''));
    final millis = deadline?.difference(DateTime.now()).inMilliseconds ?? 0;
    final remaining = millis > 0 ? (millis / 1000).ceil() : 0;
    final canRespond = !['CANCELLED', 'CLOSED', 'FAILED'].contains(state);
    final canHelp =
        state == 'PENDING_RESPONSE' ||
        (state == 'NEEDS_REVIEW' && session!.user!.admin);
    final call = obj(i['call']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (error != null)
          BannerNote(
            'No se pudo actualizar: $error. Se muestra el último estado recibido.',
            error: true,
          ),
        Section(
          title: widget.operator
              ? 'Atención del incidente'
              : state == 'PENDING_RESPONSE'
              ? '¿Está todo bien?'
              : 'Estado de la respuesta',
          subtitle: 'Abierto el ${boTime(i['created_at'])}',
          children: [
            Align(alignment: Alignment.centerLeft, child: StatusBadge(state)),
            gap(),
            if (state == 'PENDING_RESPONSE') ...[
              Text(
                '$remaining segundos para responder',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              gap(),
              Text('Plazo del servidor: ${boTime(i['response_deadline'])}'),
              gap(),
            ],
            if (i['cancellation_requested'] == true)
              const BannerNote(
                'El usuario informó que está bien y solicitó cancelar la atención al operador.',
              ),
            if (!widget.operator && canRespond) ...[
              ActionButton(
                label: 'Estoy bien',
                icon: Icons.check_circle_outline,
                enabled: !busy,
                action: () => _action('I_AM_OK'),
              ),
              if (canHelp)
                ActionButton(
                  label: 'Solicitar ayuda simulada',
                  icon: Icons.headset_mic_outlined,
                  danger: true,
                  enabled: !busy,
                  action: () => _action('REQUEST_HELP'),
                ),
              if (state == 'NEEDS_REVIEW' && !session!.user!.admin)
                const BannerNote(
                  'Un administrador debe revisar el incidente antes de reanudar el escalamiento.',
                ),
            ],
            if (widget.operator) ...[
              if (state == 'CALLING_SIMULATED')
                ActionButton(
                  label: 'Aceptar llamada simulada',
                  icon: Icons.headset_mic_outlined,
                  enabled: !busy,
                  action: () => _action('accept'),
                ),
              Text(
                'Mensaje automatizado',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              gap(6),
              SelectableText(
                txt(
                  call['transcript'],
                  'Todavía no hay una llamada asociada a este incidente.',
                ),
              ),
              gap(),
              if (call['audio_status'] == 'READY')
                _CallAudio(
                  key: ValueKey('${widget.id}:${call['id']}'),
                  id: widget.id,
                )
              else if (call['transcript'] != null)
                const BannerNote(
                  'El archivo de voz todavía no está disponible. Podés consultar el mensaje escrito.',
                ),
              if ([
                'CONNECTED_SIMULATED',
                'NEEDS_REVIEW',
                'FAILED',
              ].contains(state))
                ActionButton(
                  label: 'Cerrar atención simulada',
                  icon: Icons.done_all,
                  enabled: !busy,
                  action: () async {
                    if (await askConfirmation(
                      context,
                      'Cerrar atención simulada',
                      'Se registrará el cierre de este incidente de demostración.',
                    )) {
                      await _action('close');
                    }
                  },
                ),
            ],
            if (!widget.operator)
              const Text(
                'La cuenta regresiva es orientativa. El estado confirmado por el servidor determina la transición.',
              ),
          ],
        ),
        Section(
          title: 'Historial y evidencia',
          children: [
            OutlinedButton.icon(
              icon: const Icon(Icons.open_in_new),
              label: const Text('Abrir evento asociado'),
              onPressed: () => openPage(
                context,
                'Evento',
                EventScreen(id: txt(i['event_id'])),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _CallAudio extends StatefulWidget {
  final String id;
  const _CallAudio({super.key, required this.id});
  @override
  State<_CallAudio> createState() => _CallAudioState();
}

class _CallAudioState extends State<_CallAudio> {
  final player = AudioPlayer();
  StreamSubscription<PlayerState>? subscription;
  bool loading = false;
  PlayerState state = PlayerState.stopped;
  @override
  void initState() {
    super.initState();
    subscription = player.onPlayerStateChanged.listen((value) {
      if (mounted) setState(() => state = value);
    });
  }

  Future<void> _play() async {
    final session = AppScope.of(context);
    if (session.user?.admin != true) return;
    if (state == PlayerState.playing) {
      await player.pause();
      return;
    }
    if (state == PlayerState.paused) {
      await player.resume();
      return;
    }
    setState(() => loading = true);
    try {
      final bytes = await session.api.bytes(
        'emergencies/${widget.id}/simulated-call/audio',
      );
      if (!mounted || session.user?.admin != true) return;
      await player.play(
        BytesSource(Uint8List.fromList(bytes), mimeType: 'audio/wav'),
      );
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void dispose() {
    subscription?.cancel();
    player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ActionButton(
        label: state == PlayerState.playing
            ? 'Pausar mensaje de demostración'
            : state == PlayerState.paused
            ? 'Continuar mensaje'
            : 'Escuchar mensaje de demostración',
        icon: state == PlayerState.playing
            ? Icons.pause
            : Icons.volume_up_outlined,
        enabled: !loading,
        action: _play,
        secondary: true,
      ),
      if (state == PlayerState.playing || state == PlayerState.paused)
        ActionButton(
          label: 'Detener audio',
          icon: Icons.stop,
          secondary: true,
          action: () => player.stop(),
        ),
    ],
  );
}
