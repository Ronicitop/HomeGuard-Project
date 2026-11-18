import 'dart:async';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'domain.dart';
import 'api.dart';
import 'session.dart';
import 'event_stream.dart';

Future<bool> initializeMobileFirebase() async {
  if (kIsWeb) return false;
  try {
    if (Firebase.apps.isNotEmpty) return true;
    const key = String.fromEnvironment('FIREBASE_API_KEY'),
        app = String.fromEnvironment('FIREBASE_APP_ID'),
        project = String.fromEnvironment('FIREBASE_PROJECT_ID'),
        sender = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
    if ([key, app, project, sender].every((v) => v.isNotEmpty)) {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: key,
          appId: app,
          messagingSenderId: sender,
          projectId: project,
        ),
      );
    } else {
      await Firebase.initializeApp();
    }
    return true;
  } catch (_) {
    return false;
  }
}

@pragma('vm:entry-point')
Future<void> firebaseBackgroundMessage(RemoteMessage message) async {
  await initializeMobileFirebase(); /* Notification payload is displayed by Android. No automatic emergency action. */
}

class NotificationHooks {
  final Future<bool> Function(bool request) permission;
  final Future<String?> Function() token;
  final Future<void> Function() unregister;
  const NotificationHooks({
    required this.permission,
    required this.token,
    required this.unregister,
  });
}

class _NotificationOwner {
  final int generation;
  final String owner;
  final ApiClient api;
  const _NotificationOwner(this.generation, this.owner, this.api);
}

class MobileNotifications extends ChangeNotifier {
  final SessionController session;
  final void Function(NotificationTarget) onOpen;
  final NotificationHooks? hooks;
  final bool liveUpdates;
  final local = FlutterLocalNotificationsPlugin();
  bool enabled = false;
  String status = 'Notificaciones desactivadas';
  String? installationId;
  EventStream? _stream;
  String _cursor = 'latest';
  StreamSubscription<RemoteMessage>? _messages, _taps;
  StreamSubscription<String>? _tokens;
  bool _localReady = false, _firebase = false, _disposed = false;
  String? _owner;
  int _generation = 0;
  final _seen = <String>{};
  Future<void> _pushTail = Future.value();
  MobileNotifications(
    this.session, {
    required this.onOpen,
    this.hooks,
    this.liveUpdates = true,
  });
  String? get _identity => session.user == null
      ? null
      : '${session.api.origin}:${session.user!.household}:${session.user!.data['id']}';
  _NotificationOwner? _capture() =>
      _owner == null || session.user == null || session.user!.guest
      ? null
      : _NotificationOwner(_generation, _owner!, session.api);
  bool _current(_NotificationOwner b) =>
      !_disposed &&
      b.generation == _generation &&
      b.owner == _owner &&
      b.owner == _identity &&
      identical(b.api, session.api);
  Future<void> _serial(Future<void> Function() operation) {
    final next = _pushTail.then((_) => operation());
    _pushTail = next.catchError((Object _) {});
    return next;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _openPayload(String? payload) {
    try {
      final target = notificationTarget(jsonDecode(payload ?? '{}'));
      if (target != null) onOpen(target);
    } catch (_) {}
  }

  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    installationId =
        prefs.getString('homeguard.installation') ?? const Uuid().v4();
    await prefs.setString('homeguard.installation', installationId!);
    if (!kIsWeb) {
      try {
        await local.initialize(
          const InitializationSettings(
            android: AndroidInitializationSettings('ic_stat_homeguard'),
            iOS: DarwinInitializationSettings(
              requestAlertPermission: false,
              requestBadgePermission: false,
              requestSoundPermission: false,
            ),
          ),
          onDidReceiveNotificationResponse: (response) =>
              _openPayload(response.payload),
        );
        await local
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.createNotificationChannel(
              const AndroidNotificationChannel(
                'homeguard-events',
                'Avisos del hogar',
                description: 'Eventos de seguridad y emergencias de HomeGuard',
                importance: Importance.high,
              ),
            );
        _localReady = true;
        final launch = await local.getNotificationAppLaunchDetails();
        if (launch?.didNotificationLaunchApp == true) {
          _openPayload(launch?.notificationResponse?.payload);
        }
      } catch (_) {
        status = 'No se pudieron preparar las notificaciones de este teléfono.';
      }
    }
    _firebase = await initializeMobileFirebase();
    if (_firebase) {
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundMessage);
      _messages = FirebaseMessaging.onMessage.listen(
        (message) => _foreground(message.data, serverPush: true),
      );
      _taps = FirebaseMessaging.onMessageOpenedApp.listen((message) {
        final target = notificationTarget(message.data);
        if (target != null) onOpen(target);
      });
      final first = await FirebaseMessaging.instance.getInitialMessage();
      final target = notificationTarget(first?.data);
      if (target != null) onOpen(target);
      _tokens = FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        final binding = _capture();
        if (binding != null && enabled) {
          unawaited(
            _serial(() async {
              if (!_current(binding) || !enabled) return;
              try {
                await _register(binding, token);
              } catch (_) {
                if (_current(binding)) {
                  status = 'No se pudo actualizar el registro push.';
                  _notify();
                }
              }
            }),
          );
        }
      });
    }
  }

  Future<void> bindSession() async {
    _generation++;
    final owner = _identity;
    if (_owner != owner) {
      pause();
      _cursor = 'latest';
      _seen.clear();
      enabled = false;
      status = 'Notificaciones desactivadas';
      _owner = owner;
    }
    final binding = _capture();
    if (binding == null) return;
    resume();
    final prefs = await SharedPreferences.getInstance();
    if (!_current(binding)) return;
    if (prefs.getBool('homeguard.notifications') == true &&
        prefs.getString('homeguard.notifications.owner') == owner) {
      await enable(requestPermission: false);
    }
  }

  void resume() {
    if (!liveUpdates ||
        _stream != null ||
        session.user == null ||
        session.user!.guest) {
      return;
    }
    _stream = EventStream(session.api, (signal) {
      session.invalidate();
      if (enabled && signal.event == 'event.created') {
        unawaited(_foreground({'event_id': signal.data['entity_id']}));
      }
    }, initialCursor: _cursor);
    unawaited(_stream!.start());
  }

  void pause() {
    final stream = _stream;
    if (stream != null) {
      _cursor = stream.cursor;
      stream.close();
    }
    _stream = null;
  }

  Future<bool> _permission(bool request) async {
    if (hooks != null) return hooks!.permission(request);
    if (kIsWeb || !_localReady) return false;
    if (defaultTargetPlatform == TargetPlatform.android) {
      final platform = local
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >();
      return (request
              ? await platform?.requestNotificationsPermission()
              : await platform?.areNotificationsEnabled()) ??
          false;
    }
    final platform = local
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >();
    return request
        ? (await platform?.requestPermissions(
                alert: true,
                badge: true,
                sound: true,
              ) ??
              false)
        : ((await platform?.checkPermissions())?.isAlertEnabled ?? false);
  }

  Future<void> enable({bool requestPermission = true}) async {
    final binding = _capture();
    if (binding == null) return;
    if (kIsWeb && hooks == null) {
      status =
          'La vista web actualiza eventos; los avisos nativos se habilitan en Android.';
      _notify();
      return;
    }
    final permission = await _permission(requestPermission);
    if (!_current(binding)) return;
    if (!permission) {
      enabled = false;
      status =
          'Permiso denegado. Podés habilitarlo en los ajustes del teléfono.';
      _notify();
      return;
    }
    await _serial(() async {
      if (!_current(binding)) return;
      enabled = true;
      status =
          'Avisos con la app abierta. Push pendiente de configurar Firebase.';
      final prefs = await SharedPreferences.getInstance();
      if (!_current(binding)) return;
      await prefs.setBool('homeguard.notifications', true);
      if (!_current(binding)) return;
      await prefs.setString('homeguard.notifications.owner', binding.owner);
      if (!_current(binding)) return;
      if (_firebase || hooks != null) {
        try {
          if (_firebase && requestPermission) {
            await FirebaseMessaging.instance.requestPermission();
          }
          if (!_current(binding)) return;
          final token = hooks != null
              ? await hooks!.token()
              : await FirebaseMessaging.instance.getToken();
          if (!_current(binding)) return;
          if (token != null) {
            await _register(binding, token);
            if (!_current(binding)) return;
            status =
                'Teléfono vinculado a FCM. La entrega requiere Firebase configurado también en el servidor.';
          }
        } catch (_) {
          if (!_current(binding)) return;
          status =
              'Avisos con la app abierta. No se pudo registrar push en el servidor.';
        }
      }
      if (_current(binding)) _notify();
    });
  }

  Future<void> _register(_NotificationOwner binding, String token) async {
    if (!_current(binding)) return;
    await binding.api.post('push-devices', {
      'installation_id': installationId,
      'token': token,
      'platform': 'android',
      'provider': 'FCM',
    });
  }

  Future<void> _foreground(Json data, {bool serverPush = false}) async {
    final binding = _capture(), target = notificationTarget(data);
    if (binding == null || !enabled || target == null) return;
    final challenge =
        serverPush && data['notification_channel'] == 'EMERGENCY_CHALLENGE';
    final key =
        '${target.kind}:${target.id}:${challenge ? 'challenge' : 'event'}';
    if (_seen.contains(key)) return;
    try {
      Json event;
      if (target.kind == 'event') {
        if (challenge) return;
        event = obj(await binding.api.get('events/${target.id}'));
      } else {
        final incident = obj(await binding.api.get('emergencies/${target.id}'));
        if (!_current(binding) || !enabled) return;
        if (challenge && incident['state'] != 'PENDING_RESPONSE') return;
        event = obj(await binding.api.get('events/${incident['event_id']}'));
      }
      if (!_current(binding) || !enabled) return;
      final received = DateTime.tryParse(txt(event['received_at']));
      if (received == null ||
          DateTime.now().toUtc().difference(received.toUtc()).inMinutes >= 5) {
        return;
      }
      final prefs = obj(await binding.api.get('notification-preferences'));
      if (!_current(binding) ||
          !enabled ||
          !allowedNotification(
            prefs,
            event,
            DateTime.now(),
            emergencyChallenge: challenge,
          )) {
        return;
      }
      _seen.add(key);
      if (_seen.length > 200) _seen.remove(_seen.first);
      if (_localReady) {
        await local.show(
          target.id.hashCode & 0x7fffffff,
          event['source'] == 'SIMULATED'
              ? 'HomeGuard · Simulación'
              : 'HomeGuard · ${label(event['category'])}',
          'Hay un evento nuevo para revisar en tu hogar.',
          const NotificationDetails(
            android: AndroidNotificationDetails(
              'homeguard-events',
              'Avisos del hogar',
              channelDescription:
                  'Eventos de seguridad y emergencias de HomeGuard',
              importance: Importance.high,
              priority: Priority.high,
            ),
            iOS: DarwinNotificationDetails(),
          ),
          payload: jsonEncode(
            target.kind == 'incident'
                ? {'incident_id': target.id}
                : {'event_id': target.id},
          ),
        );
      }
    } catch (_) {}
  }

  Future<void> _deleteNativeToken() async {
    if (hooks != null) {
      await hooks!.unregister();
    } else if (_firebase) {
      try {
        await FirebaseMessaging.instance.deleteToken();
      } catch (_) {}
    }
  }

  Future<void> disable() async {
    final binding = _capture();
    if (binding == null) return;
    enabled = false;
    await _serial(() async {
      if (!_current(binding)) return;
      final prefs = await SharedPreferences.getInstance();
      if (!_current(binding)) return;
      await prefs.setBool('homeguard.notifications', false);
      if (!_current(binding)) return;
      bool unlinked = true;
      try {
        await binding.api.delete('push-devices', {
          'installation_id': installationId,
        });
      } catch (_) {
        unlinked = false;
      }
      await _deleteNativeToken();
      if (_localReady) await local.cancelAll();
      if (_current(binding)) {
        status = unlinked
            ? 'Notificaciones desactivadas'
            : 'Avisos locales desactivados; no se pudo desvincular este teléfono del servidor. Volvé a intentar al recuperar la conexión.';
        _notify();
      }
    });
  }

  Future<void> endSession() async {
    _generation++;
    pause();
    _cursor = 'latest';
    _seen.clear();
    enabled = false;
    _owner = null;
    status = 'Notificaciones desactivadas';
    await _serial(() async {
      if (_localReady) await local.cancelAll();
      await _deleteNativeToken();
    });
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    pause();
    _messages?.cancel();
    _taps?.cancel();
    _tokens?.cancel();
    super.dispose();
  }
}
