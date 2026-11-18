import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:homeguard_mobile/core/api.dart';
import 'package:homeguard_mobile/core/domain.dart';
import 'package:homeguard_mobile/core/session.dart';
import 'package:homeguard_mobile/features/settings.dart';

class _MemoryStore implements CredentialStore {
  @override
  Future<String?> read() async => null;
  @override
  Future<void> write(String value) async {}
  @override
  Future<void> clear() async {}
}

Future<SessionController> _open(
  WidgetTester tester,
  Widget editor,
  Future<http.Response> Function(http.Request) handler,
) async {
  final session = SessionController(store: _MemoryStore());
  session.api.close();
  session.api = ApiClient('http://localhost:3000', client: MockClient(handler));
  session.user = MobileUser({'id': 1, 'nombre': 'Ana', 'rol': 'ADMINISTRADOR'});
  await tester.pumpWidget(
    AppScope(
      session: session,
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () => showDialog<void>(
                context: context,
                barrierDismissible: false,
                builder: (_) => editor,
              ),
              child: const Text('Abrir'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Abrir'));
  await tester.pumpAndSettle();
  return session;
}

void main() {
  testWidgets(
    'preferences submit the loaded revision and reject incomplete quiet hours',
    (tester) async {
      final requests = <Json>[];
      final session = await _open(
        tester,
        const PreferencesEditor(
          preferences: {
            'categories': ['SECURITY'],
            'quiet_start': null,
            'quiet_end': null,
            'critical_demo_override': false,
            'revision': 7,
          },
        ),
        (request) async {
          requests.add(obj(jsonDecode(request.body)));
          return http.Response('{"revision":8}', 200);
        },
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Silencio desde'),
        '22:00',
      );
      await tester.tap(find.text('Guardar preferencias'));
      await tester.pumpAndSettle();
      expect(requests, isEmpty);
      expect(
        find.text('Completá ambos horarios o dejalos vacíos.'),
        findsWidgets,
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Silencio hasta'),
        '07:00',
      );
      await tester.tap(find.text('Guardar preferencias'));
      await tester.pumpAndSettle();
      expect(requests.single, {
        'categories': ['SECURITY'],
        'quiet_start': '22:00',
        'quiet_end': '07:00',
        'critical_demo_override': false,
        'expected_revision': 7,
      });
      expect(find.byType(PreferencesEditor), findsNothing);
      await tester.pumpWidget(const SizedBox());
      session.dispose();
    },
  );
  testWidgets('a saving form blocks dismiss until its request completes', (
    tester,
  ) async {
    final pending = Completer<http.Response>();
    final session = await _open(
      tester,
      const PreferencesEditor(
        preferences: {
          'categories': ['SYSTEM'],
          'revision': 2,
        },
      ),
      (_) => pending.future,
    );
    await tester.tap(find.text('Guardar preferencias'));
    await tester.pump();
    expect(find.text('Guardando…'), findsOneWidget);
    final dialog = tester.element(find.byType(PreferencesEditor));
    expect(await Navigator.of(dialog).maybePop(), isTrue);
    await tester.pump();
    expect(find.byType(PreferencesEditor), findsOneWidget);
    pending.complete(http.Response('{"revision":3}', 200));
    await tester.pumpAndSettle();
    expect(find.byType(PreferencesEditor), findsNothing);
    await tester.pumpWidget(const SizedBox());
    session.dispose();
  });
  testWidgets(
    'member creation validates password length and retains entered secrets after server failure',
    (tester) async {
      var requests = 0;
      final session = await _open(tester, const MemberEditor(), (
        request,
      ) async {
        requests++;
        return http.Response(
          '{"error":{"code":"EMAIL_EXISTS","message":"Ese correo ya existe."}}',
          409,
        );
      });
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Nombre'),
        'Ana',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Apellido'),
        'Pérez',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Correo'),
        'ana@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Contraseña inicial'),
        'short',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Registrar miembro'));
      await tester.pumpAndSettle();
      expect(requests, 0);
      expect(find.text('Usá al menos 10 caracteres.'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Contraseña inicial'),
        'safe-test-password',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Registrar miembro'));
      await tester.pumpAndSettle();
      expect(requests, 1);
      expect(find.text('Ese correo ya existe.'), findsOneWidget);
      final password = tester.widget<TextFormField>(
        find.widgetWithText(TextFormField, 'Contraseña inicial'),
      );
      expect(password.controller!.text, 'safe-test-password');
      await tester.pumpWidget(const SizedBox());
      session.dispose();
    },
  );
}
