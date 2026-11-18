import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:homeguard_mobile/core/api.dart';
import 'package:homeguard_mobile/core/domain.dart';
import 'package:homeguard_mobile/core/notifications.dart';
import 'package:homeguard_mobile/core/session.dart';

class _Store implements CredentialStore {
  @override
  Future<String?> read() async => null;
  @override
  Future<void> write(String value) async {}
  @override
  Future<void> clear() async {}
}

SessionController _session(List<String> registered) {
  final s = SessionController(
    store: _Store(),
    server: 'http://localhost:3000',
    createApi: (origin) => ApiClient(
      origin,
      client: MockClient((r) async {
        if (r.method == 'POST') {
          registered.add(obj(jsonDecode(r.body))['token']);
        }
        return http.Response('{}', 200);
      }),
    ),
  );
  s.user = MobileUser({'id': 1, 'rol': 'RESIDENTE', 'household_id': 'one'});
  s.api.token = 'old';
  return s;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'an old permission dialog cannot grant notifications to a new account',
    () async {
      final registered = <String>[],
          permission = Completer<bool>(),
          s = _session(registered);
      final service = MobileNotifications(
        s,
        onOpen: (_) {},
        liveUpdates: false,
        hooks: NotificationHooks(
          permission: (_) => permission.future,
          token: () async => 'old-token',
          unregister: () async {},
        ),
      );
      await service.bindSession();
      final pending = service.enable();
      await service.endSession();
      s.user = MobileUser({'id': 2, 'rol': 'RESIDENTE', 'household_id': 'two'});
      await service.bindSession();
      permission.complete(true);
      await pending;
      expect(registered, isEmpty);
      expect(service.enabled, false);
      service.dispose();
      s.dispose();
    },
  );
  test(
    'old token work finishes before cleanup and new-account registration',
    () async {
      final registered = <String>[],
          started = Completer<void>(),
          oldToken = Completer<String?>(),
          s = _session(registered);
      var tokenCalls = 0, deletions = 0;
      final service = MobileNotifications(
        s,
        onOpen: (_) {},
        liveUpdates: false,
        hooks: NotificationHooks(
          permission: (_) async => true,
          token: () {
            tokenCalls++;
            if (tokenCalls == 1) {
              started.complete();
              return oldToken.future;
            }
            return Future.value('new-token');
          },
          unregister: () async {
            deletions++;
          },
        ),
      );
      await service.bindSession();
      service.installationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      final oldEnable = service.enable();
      await started.future;
      final cleanup = service.endSession();
      s.user = MobileUser({'id': 2, 'rol': 'RESIDENTE', 'household_id': 'two'});
      await service.bindSession();
      final newEnable = service.enable();
      oldToken.complete('old-token');
      await Future.wait([oldEnable, cleanup, newEnable]);
      expect(registered, ['new-token']);
      expect(deletions, 1);
      expect(service.enabled, true);
      service.dispose();
      s.dispose();
    },
  );
  test(
    'initialization creates the Android channel and restores a local-notification cold-start link',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      AndroidFlutterLocalNotificationsPlugin.registerWith();
      const channel = MethodChannel(
        'dexterous.com/flutter/local_notifications',
      );
      final methods = <MethodCall>[];
      const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            methods.add(call);
            if (call.method == 'getNotificationAppLaunchDetails') {
              return {
                'notificationLaunchedApp': true,
                'notificationResponse': {
                  'notificationId': 1,
                  'notificationResponseType': 0,
                  'payload': jsonEncode({'event_id': id}),
                },
              };
            }
            return true;
          });
      final s = _session([]), targets = <NotificationTarget>[];
      final service = MobileNotifications(
        s,
        onOpen: targets.add,
        liveUpdates: false,
      );
      try {
        await service.initialize();
        expect(
          methods.any((c) => c.method == 'createNotificationChannel'),
          true,
        );
        expect(targets.single.id, id);
      } finally {
        service.dispose();
        s.dispose();
        debugDefaultTargetPlatformOverride = null;
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null);
      }
    },
  );
}
