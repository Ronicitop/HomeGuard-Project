import 'package:flutter/material.dart';
import '../core/domain.dart';
import '../core/session.dart';
import '../ui/shared.dart';
import 'events.dart';
import 'emergencies.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    return ResourcePane(
      load: (api) async {
        final dashboard = await api.get('dashboard');
        final events = session.user!.guest
            ? {'items': []}
            : await api.get('events?limit=5');
        return {'dashboard': dashboard, 'events': events};
      },
      builder: (context, value, reload) {
        final d = obj(obj(value)['dashboard']), counts = obj(d['counts']);
        return PageFrame(
          title: 'Tu hogar, ${session.user!.name}',
          subtitle: 'Una mirada clara a lo que necesita tu atención.',
          children: [
            Container(
              padding: const EdgeInsets.all(22),
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: brand,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.verified_user_outlined,
                    color: Colors.white,
                    size: 36,
                  ),
                  gap(),
                  Text(
                    'Modo ${label(obj(d['mode'])['mode']).toLowerCase()}',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  gap(6),
                  Text(
                    numInt(counts['new']) == 0
                        ? 'No hay eventos nuevos pendientes de revisión.'
                        : '${counts['new']} eventos nuevos esperan tu revisión.',
                    style: const TextStyle(color: Colors.white),
                  ),
                ],
              ),
            ),
            LayoutBuilder(
              builder: (context, box) {
                final width = (box.maxWidth - 12) / 2;
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final entry in {
                      'new': 'Eventos nuevos',
                      'security': 'Alertas de seguridad',
                      'emergency': 'Emergencias',
                      'total': 'Eventos guardados',
                    }.entries)
                      SizedBox(
                        width: width,
                        child: Section(
                          title: entry.value,
                          children: [
                            Text(
                              txt(counts[entry.key], '0'),
                              style: const TextStyle(
                                fontSize: 29,
                                fontWeight: FontWeight.w700,
                                color: brand,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
            if (!session.user!.guest) ...[
              if (rows(d['active_incidents']).isNotEmpty)
                Section(
                  title: 'Necesitás responder',
                  children: [
                    for (final i in rows(d['active_incidents']))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.health_and_safety_outlined),
                        title: Text(label(i['state'])),
                        subtitle: Text(boTime(i['created_at'])),
                        onTap: () => openPage(
                          context,
                          'Emergencia',
                          IncidentScreen(id: txt(i['id'])),
                        ),
                      ),
                  ],
                ),
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text(
                  'Últimos eventos',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
                ),
              ),
              if (rows(obj(obj(value)['events'])['items']).isEmpty)
                const Section(
                  title: 'Tu historial',
                  children: [
                    EmptyState(
                      title: 'Sin eventos todavía',
                      description:
                          'Aquí aparecerán las observaciones del sistema.',
                    ),
                  ],
                ),
              ...rows(
                obj(obj(value)['events'])['items'],
              ).map((e) => EventTile(e)),
            ],
            if (session.user!.admin)
              Section(
                title: 'Prueba del sistema',
                subtitle:
                    'Los eventos de esta sección siempre se identifican como simulados.',
                children: [
                  ActionButton(
                    label: 'Generar evento de prueba',
                    icon: Icons.science_outlined,
                    secondary: true,
                    action: () async {
                      await session.api.post('demo/events', {
                        'scenario': 'INTRUSION',
                        'notify_enabled': true,
                        'save_clip_enabled': false,
                      });
                      session.invalidate();
                      if (context.mounted) {
                        showMessage(context, 'Evento simulado registrado.');
                      }
                    },
                  ),
                ],
              ),
          ],
        );
      },
    );
  }
}

class MovementsScreen extends StatelessWidget {
  const MovementsScreen({super.key});
  @override
  Widget build(BuildContext context) => const PageFrame(
    title: 'Movimientos',
    subtitle: 'Acciones y actividad del hogar.',
    children: [
      Section(
        title: 'Servicio pendiente de conexión',
        children: [
          EmptyState(
            title: 'Configuración de movimientos pendiente',
            description:
                'Esta función todavía no está disponible en el sistema. Podés revisar los movimientos que ya se detectaron desde Eventos.',
            icon: Icons.directions_walk,
          ),
        ],
      ),
    ],
  );
}
