import 'dart:async';
import 'package:flutter/material.dart';
import 'core/domain.dart';
import 'core/session.dart';
import 'core/notifications.dart';
import 'features/login.dart';
import 'features/home.dart';
import 'features/events.dart';
import 'features/cameras.dart';
import 'features/connections.dart';
import 'features/emergencies.dart';
import 'features/settings.dart';
import 'ui/shared.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(HomeGuardApp(session: SessionController()));
}

class HomeGuardApp extends StatefulWidget {
  final SessionController session;
  final bool initializeServices;
  const HomeGuardApp({
    super.key,
    required this.session,
    this.initializeServices = true,
  });
  @override
  State<HomeGuardApp> createState() => _HomeGuardAppState();
}

class _HomeGuardAppState extends State<HomeGuardApp>
    with WidgetsBindingObserver {
  late MobileNotifications notifications;
  GlobalKey<NavigatorState> navigation = GlobalKey<NavigatorState>();
  int epoch = 0;
  String? owner;
  NotificationTarget? pending;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    notifications = MobileNotifications(
      widget.session,
      onOpen: openNotification,
    );
    widget.session.onSessionEnded = () {
      pending = null;
      unawaited(notifications.endSession());
    };
    widget.session.addListener(changed);
    if (widget.initializeServices) unawaited(initialize());
  }

  Future<void> initialize() async {
    try {
      await notifications.initialize();
    } catch (_) {
      notifications.status =
          'No se pudieron iniciar los avisos. Podés revisar eventos en la app.';
    }
    await widget.session.restore();
  }

  void changed() {
    if (!mounted) return;
    final session = widget.session;
    if (epoch != session.navigationEpoch) {
      epoch = session.navigationEpoch;
      navigation = GlobalKey<NavigatorState>();
    }
    final next = session.user == null
        ? null
        : '${session.api.origin}:${session.user!.household}:${session.user!.data['id']}';
    if (owner != next) {
      owner = next;
      unawaited(notifications.bindSession());
    }
    setState(() {});
    if (pending != null && session.user != null) {
      final target = pending!;
      pending = null;
      openNotification(target);
    }
  }

  void openNotification(NotificationTarget target) {
    if (widget.session.user == null) {
      pending = target;
      return;
    }
    if (widget.session.user!.guest) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = navigation.currentContext;
      if (!mounted || context == null || widget.session.user == null) return;
      openPage(
        context,
        target.kind == 'incident' ? 'Emergencia' : 'Evento',
        target.kind == 'incident'
            ? IncidentScreen(id: target.id)
            : EventScreen(id: target.id),
      );
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      notifications.resume();
      widget.session.invalidate();
    } else {
      notifications.pause();
    }
  }

  @override
  void dispose() {
    widget.session.removeListener(changed);
    WidgetsBinding.instance.removeObserver(this);
    notifications.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppScope(
    session: widget.session,
    child: MaterialApp(
      key: ValueKey(epoch),
      navigatorKey: navigation,
      title: 'HomeGuard',
      debugShowCheckedModeBanner: false,
      theme: homeTheme(),
      home: widget.session.loading
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : widget.session.user == null
          ? const LoginScreen()
          : HomeShell(notifications: notifications),
    ),
  );
}

class HomeShell extends StatefulWidget {
  final MobileNotifications notifications;
  const HomeShell({super.key, required this.notifications});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int selected = 0;
  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context), guest = session.user!.guest;
    final screens = <Widget>[
      const DashboardScreen(),
      const CamerasScreen(),
      const EventsScreen(),
      const SecurityScreen(),
      MoreScreen(notifications: widget.notifications),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.shield_outlined, color: brand),
            SizedBox(width: 8),
            Text('homeguard.', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Chip(
              label: Text(guest ? 'Invitado' : 'Mi hogar'),
              visualDensity: VisualDensity.compact,
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: guest
            ? Column(
                children: [
                  const Expanded(child: DashboardScreen()),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: ActionButton(
                      label: 'Cerrar sesión',
                      secondary: true,
                      action: () => session.signOut(),
                    ),
                  ),
                ],
              )
            : KeyedSubtree(key: ValueKey(selected), child: screens[selected]),
      ),
      bottomNavigationBar: guest
          ? null
          : NavigationBar(
              selectedIndex: selected,
              onDestinationSelected: (v) => setState(() => selected = v),
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home),
                  label: 'Resumen',
                ),
                NavigationDestination(
                  icon: Icon(Icons.videocam_outlined),
                  selectedIcon: Icon(Icons.videocam),
                  label: 'Cámaras',
                ),
                NavigationDestination(
                  icon: Icon(Icons.history),
                  label: 'Eventos',
                ),
                NavigationDestination(
                  icon: Icon(Icons.shield_outlined),
                  selectedIcon: Icon(Icons.shield),
                  label: 'Seguridad',
                ),
                NavigationDestination(
                  icon: Icon(Icons.more_horiz),
                  label: 'Más',
                ),
              ],
            ),
    );
  }
}

class MoreScreen extends StatelessWidget {
  final MobileNotifications notifications;
  const MoreScreen({super.key, required this.notifications});
  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context);
    return PageFrame(
      title: 'Mi hogar',
      subtitle: '${session.user!.name} · ${label(session.user!.data['rol'])}',
      children: [
        Section(
          title: 'Administrar y consultar',
          children: [
            _link(
              context,
              Icons.cable,
              'Conexiones',
              const ConnectionsScreen(),
            ),
            _link(
              context,
              Icons.people_outline,
              'Personas',
              const PeopleScreen(),
            ),
            _link(
              context,
              Icons.directions_walk,
              'Movimientos',
              const MovementsScreen(),
            ),
            _link(
              context,
              Icons.health_and_safety_outlined,
              'Emergencias',
              const EmergenciesScreen(),
            ),
            if (session.user!.admin)
              _link(
                context,
                Icons.headset_mic_outlined,
                'Central simulada',
                const OperatorScreen(),
              ),
            _link(
              context,
              Icons.settings_outlined,
              'Configuración',
              SettingsScreen(notifications: notifications),
            ),
          ],
        ),
        const BannerNote(
          'Prototipo universitario. Las llamadas de emergencia son simuladas. La app no da de alta cámaras ni sensores.',
        ),
      ],
    );
  }

  Widget _link(
    BuildContext context,
    IconData icon,
    String title,
    Widget body,
  ) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon, color: brand),
    title: Text(title),
    trailing: const Icon(Icons.chevron_right),
    onTap: () => openPage(context, title, body),
  );
}
