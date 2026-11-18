import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:homeguard_mobile/core/api.dart';
import 'package:homeguard_mobile/core/domain.dart';
import 'package:homeguard_mobile/core/session.dart';

class _Store implements CredentialStore {
  String? value;
  Completer<void>? pendingClear;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String text) async {
    value = text;
  }

  @override
  Future<void> clear() async {
    await pendingClear?.future;
    value = null;
  }
}

String get issued => jsonEncode({
  'token': 'new-private-token',
  'user': {
    'id': 2,
    'nombre': 'Nueva',
    'rol': 'RESIDENTE',
    'household_id': 'other',
  },
});
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('old pending logout cannot erase a newly signed-in session', () async {
    final logout = Completer<http.Response>(), store = _Store();
    final session = SessionController(
      store: store,
      server: 'http://localhost:3000',
      createApi: (origin) => ApiClient(
        origin,
        client: MockClient(
          (request) => request.url.path.endsWith('/logout')
              ? logout.future
              : Future.value(http.Response(issued, 200)),
        ),
      ),
    );
    session.user = MobileUser({'id': 1, 'rol': 'ADMINISTRADOR'});
    session.api.token = 'old';
    final pending = session.signOut();
    session.api.onUnauthorized!();
    await session.signIn(
      'http://localhost:3000',
      'new@example.local',
      'password',
    );
    logout.complete(http.Response('{}', 200));
    await pending;
    expect(session.user?.data['id'], 2);
    expect(session.api.token, 'new-private-token');
    expect(store.value, contains('new-private-token'));
    session.dispose();
  });
  test(
    'secure-store revocation completes before a newer token is persisted',
    () async {
      final store = _Store()..pendingClear = Completer<void>();
      final session = SessionController(
        store: store,
        server: 'http://localhost:3000',
        createApi: (origin) => ApiClient(
          origin,
          client: MockClient((_) async => http.Response(issued, 200)),
        ),
      );
      session.api.token = 'old';
      session.user = MobileUser({'id': 1, 'rol': 'ADMINISTRADOR'});
      session.api.onUnauthorized!();
      final login = session.signIn(
        'http://localhost:3000',
        'new@example.local',
        'password',
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));
      store.pendingClear!.complete();
      await login;
      await Future<void>.delayed(Duration.zero);
      expect(store.value, contains('new-private-token'));
      session.dispose();
    },
  );
  test(
    'stored tokens from another server are discarded without a network request',
    () async {
      var calls = 0;
      final store = _Store()
        ..value = jsonEncode({
          'server': 'http://192.168.1.8:3000',
          'token': 'private',
        });
      final session = SessionController(
        store: store,
        server: 'http://localhost:3000',
        createApi: (origin) => ApiClient(
          origin,
          client: MockClient((_) async {
            calls++;
            return http.Response('{}', 200);
          }),
        ),
      );
      await session.restore();
      expect(calls, 0);
      expect(store.value, isNull);
      expect(session.user, isNull);
      session.dispose();
    },
  );
  test('a revoked stored token is cleared even before a user is restored',()async{final store=_Store()..value=jsonEncode({'server':'http://localhost:3000','token':'revoked'});final session=SessionController(store:store,server:'http://localhost:3000',createApi:(origin)=>ApiClient(origin,client:MockClient((_)async=>http.Response('{"error":{"code":"INVALID_SESSION","message":"Sesión vencida"}}',401))));await session.restore();await Future<void>.delayed(Duration.zero);expect(store.value,isNull);expect(session.user,isNull);session.dispose();});
}
