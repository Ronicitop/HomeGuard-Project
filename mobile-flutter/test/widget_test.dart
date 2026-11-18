import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:homeguard_mobile/core/api.dart';
import 'package:homeguard_mobile/core/domain.dart';
import 'package:homeguard_mobile/core/session.dart';
import 'package:homeguard_mobile/main.dart';

class MemoryStore implements CredentialStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String text) async {
    value = text;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

SessionController sessionFor(String? role) {
  final session = SessionController(
    store: MemoryStore(),
    server: 'http://127.0.0.1:3000',
  );
  session.loading = false;
  if (role != null) {
    session.user = MobileUser({
      'id': 1,
      'rol': role,
      'nombre': 'Ana',
      'household_id': 'test',
    });
    session.api.close();
    session.api = ApiClient(
      'http://127.0.0.1:3000',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/dashboard')) {
          return http.Response(
            '{"counts":{"new":0,"total":0,"security":0,"emergency":0},"mode":{"mode":"HOME"},"active_incidents":[]}',
            200,
          );
        }
        return http.Response('{"items":[]}', 200);
      }),
    );
    session.api.token = 'test-token';
  }
  return session;
}

void main() {
  testWidgets(
    'resident can reach logout on a small phone and return to login',
    (tester) async {
      final session = sessionFor('RESIDENTE');
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        HomeGuardApp(session: session, initializeServices: false),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.more_horiz));
      await tester.pumpAndSettle();
      for (final label in ['Configuración', 'Cerrar sesión']) {
        final target = find.text(label);
        await tester.ensureVisible(target);
        await tester.tap(target);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
      }
      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();
      expect(session.api.token, isNull);
      expect(find.text('Entrar a mi hogar'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      session.dispose();
    },
  );
  testWidgets(
    'phone login is native, has no default password and never offers hardware creation',
    (tester) async {
      final session = sessionFor(null);
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        HomeGuardApp(session: session, initializeServices: false),
      );
      await tester.pumpAndSettle();
      expect(find.text('Entrar a mi hogar'), findsOneWidget);
      expect(find.text('Correo electrónico'), findsOneWidget);
      expect(find.text('Agregar equipo'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      session.dispose();
    },
  );
  testWidgets('guest sees summary but cannot open cameras or manage devices', (
    tester,
  ) async {
    final session = sessionFor('INVITADO');
    await tester.pumpWidget(
      HomeGuardApp(session: session, initializeServices: false),
    );
    await tester.pumpAndSettle();
    expect(find.text('Tu hogar, Ana'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Agregar equipo'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    session.dispose();
  });
  testWidgets('resident menu excludes operator and hardware registration', (
    tester,
  ) async {
    final session = sessionFor('RESIDENTE');
    await tester.pumpWidget(
      HomeGuardApp(session: session, initializeServices: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.text('Conexiones'), findsOneWidget);
    expect(find.text('Personas'), findsOneWidget);
    expect(find.text('Emergencias'), findsOneWidget);
    expect(find.text('Central simulada'), findsNothing);
    expect(find.text('Agregar cámara'), findsNothing);
    expect(find.text('Agregar sensor'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    session.dispose();
  });
}
