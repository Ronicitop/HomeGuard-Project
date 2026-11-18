import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../core/domain.dart';
import '../core/session.dart';
import '../ui/shared.dart';

class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});
  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  String category = '', status = '', source = '', search = '';
  final text = TextEditingController();
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = Uri(
      queryParameters: {
        if (category.isNotEmpty) 'category': category,
        if (status.isNotEmpty) 'status': status,
        if (source.isNotEmpty) 'source': source,
        if (search.isNotEmpty) 'search': search,
        'limit': '20',
      },
    ).query;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
          child: Column(
            children: [
              TextField(
                controller: text,
                decoration: InputDecoration(
                  labelText: 'Buscar eventos',
                  suffixIcon: IconButton(
                    tooltip: 'Buscar',
                    icon: const Icon(Icons.search),
                    onPressed: () => setState(() => search = text.text.trim()),
                  ),
                ),
                onSubmitted: (v) => setState(() => search = v.trim()),
              ),
              gap(),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _filter('Categoría', category, [
                    '',
                    'SECURITY',
                    'MOVEMENT',
                    'EMERGENCY',
                    'SYSTEM',
                  ], (v) => setState(() => category = v)),
                  _filter('Estado', status, [
                    '',
                    'NEW',
                    'ACKNOWLEDGED',
                    'RESOLVED',
                    'FALSE_POSITIVE',
                  ], (v) => setState(() => status = v)),
                  _filter('Origen', source, [
                    '',
                    'LIVE',
                    'REPLAY',
                    'SIMULATED',
                  ], (v) => setState(() => source = v)),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: ResourcePane(
            path: 'events?$query',
            builder: (context, data, reload) => PageFrame(
              title: 'Eventos',
              subtitle: 'Historial y evidencia · Hora de Bolivia',
              children: [
                if (rows(obj(data)['items']).isEmpty)
                  const EmptyState(
                    title: 'Sin eventos para estos filtros',
                    description: 'Los eventos recibidos aparecerán aquí.',
                  ),
                ...rows(obj(data)['items']).map((e) => EventTile(e)),
                if (obj(data)['next_cursor'] != null)
                  OutlinedButton(
                    onPressed: () => openPage(
                      context,
                      'Más eventos',
                      EventPage(
                        query: query,
                        cursor: txt(obj(data)['next_cursor']),
                      ),
                    ),
                    child: const Text('Ver más eventos'),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _filter(
    String title,
    String selected,
    List<String> values,
    ValueChanged<String> change,
  ) => DropdownButton<String>(
    value: selected,
    items: values
        .map(
          (v) => DropdownMenuItem(
            value: v,
            child: Text(v.isEmpty ? title : label(v)),
          ),
        )
        .toList(),
    onChanged: (v) {
      if (v != null) change(v);
    },
  );
}

class EventPage extends StatelessWidget {
  final String query, cursor;
  const EventPage({super.key, required this.query, required this.cursor});
  @override
  Widget build(BuildContext context) => ResourcePane(
    path: 'events?$query&cursor=${Uri.encodeQueryComponent(cursor)}',
    builder: (context, data, reload) => PageFrame(
      title: 'Más eventos',
      children: [
        ...rows(obj(data)['items']).map((e) => EventTile(e)),
        if (obj(data)['next_cursor'] != null)
          OutlinedButton(
            onPressed: () => openPage(
              context,
              'Más eventos',
              EventPage(query: query, cursor: txt(obj(data)['next_cursor'])),
            ),
            child: const Text('Siguiente página'),
          ),
      ],
    ),
  );
}

class EventTile extends StatelessWidget {
  final Json event;
  const EventTile(this.event, {super.key});
  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () =>
          openPage(context, 'Evento', EventScreen(id: txt(event['id']))),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  event['category'] == 'EMERGENCY'
                      ? Icons.health_and_safety_outlined
                      : Icons.notifications_outlined,
                  color: brand,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    txt(event['summary']),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
            gap(),
            Text(
              boTime(event['occurred_at']),
              style: const TextStyle(fontSize: 12, color: muted),
            ),
            gap(),
            badges([event['source'], event['status'], event['severity']]),
          ],
        ),
      ),
    ),
  );
}

class EventScreen extends StatelessWidget {
  final String id;
  const EventScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context) => ResourcePane(
    path: 'events/$id',
    refreshSeconds: 5,
    builder: (context, value, reload) {
      final e = obj(value), session = AppScope.of(context);
      return PageFrame(
        title: txt(e['summary']),
        subtitle: '${boTime(e['occurred_at'])} · Hora de Bolivia',
        children: [
          badges([e['source'], e['category'], e['severity'], e['status']]),
          gap(),
          if (e['late'] == true)
            const BannerNote(
              'Este evento llegó tarde o pertenece a una configuración anterior. Se conserva para revisión sin ejecutar acciones nuevas.',
            ),
          Section(
            title: 'Revisar evento',
            children: [
              for (final entry in {
                'ACKNOWLEDGED': 'Marcar como revisado',
                'RESOLVED': 'Marcar como resuelto',
                'FALSE_POSITIVE': 'Marcar como falsa alarma',
              }.entries)
                ActionButton(
                  label: entry.value,
                  secondary: entry.key != 'ACKNOWLEDGED',
                  action: () async {
                    await session.api.patch('events/$id', {
                      'status': entry.key,
                      'expected_revision': e['revision'],
                    });
                    session.invalidate();
                  },
                ),
            ],
          ),
          Section(
            title: 'Evidencia',
            children: [
              if (obj(e['decisions'])['clip_requested'] != true)
                const EmptyState(
                  title: 'Sin clip solicitado',
                  description:
                      'La opción de guardar evidencia estaba desactivada.',
                )
              else
                ResourcePane(
                  path: 'events/$id/clip',
                  builder: (ctx, clip, _) =>
                      ['READY', 'PARTIAL'].contains(obj(clip)['status'])
                      ? ClipPlayer(path: 'clips/${obj(clip)['id']}/content')
                      : const BannerNote(
                          'La evidencia aún no está disponible. El historial del evento se conserva.',
                        ),
                ),
            ],
          ),
          Section(
            title: 'Acciones y entregas',
            subtitle:
                'La aceptación del proveedor no confirma que el aviso haya sido leído.',
            children: [
              for (final job in rows(e['jobs']))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(txt(job['kind'])),
                  subtitle: job['error_code'] == null
                      ? null
                      : Text(txt(job['error_code'])),
                  trailing: StatusBadge(job['status']),
                ),
              for (final n in rows(e['notifications']))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Notificación'),
                  subtitle: n['error_code'] == null
                      ? null
                      : Text(txt(n['error_code'])),
                  trailing: StatusBadge(n['status']),
                ),
            ],
          ),
        ],
      );
    },
  );
}

class ClipPlayer extends StatefulWidget {
  final String path;
  const ClipPlayer({super.key, required this.path});
  @override
  State<ClipPlayer> createState() => _ClipPlayerState();
}

class _ClipPlayerState extends State<ClipPlayer> {
  VideoPlayerController? controller;
  String? error;
  bool started = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (started) return;
    started = true;
    final api = AppScope.of(context).api;
    controller = VideoPlayerController.networkUrl(
      api.uri(widget.path),
      httpHeaders: api.headers,
    );
    controller!
        .initialize()
        .then((_) {
          if (mounted) setState(() {});
        })
        .catchError((Object _) {
          if (mounted) {
            setState(
              () => error =
                  'No se pudo abrir el clip. Revisá el servicio de evidencia.',
            );
          }
        });
  }

  @override
  void dispose() {
    controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (error != null) return BannerNote(error!, error: true);
    final c = controller;
    if (c == null || !c.value.isInitialized) {
      return const LinearProgressIndicator();
    }
    return Column(
      children: [
        AspectRatio(aspectRatio: c.value.aspectRatio, child: VideoPlayer(c)),
        VideoProgressIndicator(c, allowScrubbing: true),
        IconButton(
          tooltip: c.value.isPlaying ? 'Pausar' : 'Reproducir',
          icon: Icon(c.value.isPlaying ? Icons.pause : Icons.play_arrow),
          onPressed: () {
            setState(() {
              c.value.isPlaying ? c.pause() : c.play();
            });
          },
        ),
      ],
    );
  }
}
