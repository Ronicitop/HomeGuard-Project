import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'domain.dart';

ApiClient _defaultApi(String server) => ApiClient(server);

abstract interface class CredentialStore {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> clear();
}

class SecureCredentialStore implements CredentialStore {
  final FlutterSecureStorage storage;
  SecureCredentialStore([this.storage = const FlutterSecureStorage()]);
  @override
  Future<String?> read() => storage.read(key: 'homeguard.session.v1');
  @override
  Future<void> write(String value) =>
      storage.write(key: 'homeguard.session.v1', value: value);
  @override
  Future<void> clear() => storage.delete(key: 'homeguard.session.v1');
}

class SessionController extends ChangeNotifier {
  final ApiClient Function(String) _createApi;
  final CredentialStore store;
  ApiClient api;
  MobileUser? user;
  bool loading = true;
  String? error;
  int navigationEpoch = 0;
  int _generation = 0;
  Future<void> _storageTail = Future.value();
  Future<void> _persist(Future<void> Function() operation) {
    final next = _storageTail.then((_) => operation());
    _storageTail = next.catchError((Object _) {});
    return next;
  }

  final refresh = ValueNotifier<int>(0);
  void Function()? onSessionEnded;
  SessionController({
    CredentialStore? store,
    String? server,
    ApiClient Function(String)? createApi,
  }) : store = store ?? SecureCredentialStore(),
       _createApi = createApi ?? _defaultApi,
       api = (createApi ?? _defaultApi)(
         server ??
             const String.fromEnvironment(
               'HOMEGUARD_SERVER',
               defaultValue: kIsWeb
                   ? 'http://127.0.0.1:3000'
                   : 'http://10.0.2.2:3000',
             ),
       ) {
    _watchExpiry(api);
  }
  Future<void> restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final last = prefs.getString('homeguard.server');
      if (last != null) _setServer(last);
      final saved = await store.read();
      if (saved != null) {
        final data = obj(jsonDecode(saved));
        if (data['server'] == api.origin && data['token'] is String) {
          api.token = data['token'];
          user = MobileUser(obj(await api.get('auth/me')));
        } else {
          await _persist(store.clear);
        }
      }
    } catch (e) {
      error = e.toString();
      if (e is FormatException) {
        await _persist(store.clear);
      }
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void _setServer(String server) {
    api.close();
    api = _createApi(server);
    _watchExpiry(api);
  }

  void _watchExpiry(ApiClient client) {
    client.onUnauthorized = () {
      if (identical(api, client)) _expired();
    };
  }

  Future<void> signIn(String server, String email, String password) async {
    final origin = serverOrigin(server);
    final generation = ++_generation;
    _setServer(origin);
    final client = api;
    final issued = obj(
      await client.post('auth/login', {
        'email': email.trim(),
        'password': password,
        'platform': 'mobile',
      }),
    );
    if (generation != _generation || !identical(client, api)) return;
    final token = issued['token'];
    if (token is! String || token.isEmpty) {
      throw const ApiException(
        0,
        'NO_TOKEN',
        'La respuesta no incluyó una sesión móvil.',
      );
    }
    client.token = token;
    try {
      await _persist(() async {
        if (generation == _generation && identical(client, api)) {
          await store.write(jsonEncode({'server': origin, 'token': token}));
        }
      });
    } catch (_) {
      client.token = null;
      throw const ApiException(
        0,
        'SECURE_STORAGE',
        'No se pudo guardar la sesión de forma segura.',
      );
    }
    if (generation != _generation || !identical(client, api)) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('homeguard.server', origin);
    if (generation != _generation || !identical(client, api)) return;
    user = MobileUser(obj(issued['user']));
    error = null;
    navigationEpoch++;
    notifyListeners();
  }

  Future<void> signOut({String? installationId}) async {
    final client = api, generation = _generation;
    try {
      if (client.token != null) {
        await client.post('auth/logout', {
          if (installationId != null) 'installation_id': installationId,
        });
      }
    } catch (_) {}
    if (generation != _generation || !identical(client, api)) return;
    await _clear();
  }

  void _expired() {
    if (api.token == null && user == null) return;
    _generation++;
    api.token = null;
    user = null;
    error = 'Tu sesión venció o fue revocada. Volvé a iniciar sesión.';
    navigationEpoch++;
    onSessionEnded?.call();
    final pending = _persist(store.clear);
    notifyListeners();
    pending.catchError((Object _) {
      error = 'No se pudo limpiar el almacenamiento seguro.';
    });
  }

  Future<void> _clear() async {
    _generation++;
    api.token = null;
    user = null;
    error = null;
    navigationEpoch++;
    onSessionEnded?.call();
    final pending = _persist(store.clear);
    notifyListeners();
    await pending;
  }

  void invalidate() => refresh.value++;
  @override
  void dispose() {
    api.close();
    refresh.dispose();
    super.dispose();
  }
}

class AppScope extends InheritedNotifier<SessionController> {
  const AppScope({
    super.key,
    required SessionController session,
    required super.child,
  }) : super(notifier: session);
  static SessionController of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
