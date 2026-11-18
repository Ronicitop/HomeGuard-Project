import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:homeguard_mobile/core/api.dart';
import 'package:homeguard_mobile/core/domain.dart';
import 'package:homeguard_mobile/core/session.dart';
import 'package:homeguard_mobile/ui/shared.dart';

class _Store implements CredentialStore {
  @override
  Future<String?> read() async => null;
  @override
  Future<void> write(String value) async {}
  @override
  Future<void> clear() async {}
}

class _Player extends StatefulWidget {
  final String value;
  const _Player(this.value);
  static int created = 0;
  @override
  State<_Player> createState() => _PlayerState();
}

class _PlayerState extends State<_Player> {
  @override
  void initState() {
    super.initState();
    _Player.created++;
  }

  @override
  Widget build(BuildContext context) => Text(widget.value);
}

void main() {
  testWidgets(
    'same-resource refresh preserves player state; a changed path never shows the previous event',
    (tester) async {
      final pending = Completer<http.Response>();
      var calls = 0;
      final session = SessionController(
        store: _Store(),
        server: 'http://localhost:3000',
        createApi: (origin) => ApiClient(
          origin,
          client: MockClient((_) async {
            calls++;
            return calls == 1
                ? http.Response('{"version":1}', 200)
                : pending.future;
          }),
        ),
      );
      session.user = MobileUser({'rol': 'ADMINISTRADOR'});
      _Player.created = 0;
      String path = 'events/one';
      late StateSetter update;
      await tester.pumpWidget(
        AppScope(
          session: session,
          child: MaterialApp(
            home: StatefulBuilder(
              builder: (context, set) {
                update = set;
                return Scaffold(
                  body: ResourcePane(
                    path: path,
                    refreshSeconds: 0,
                    builder: (_, data, reload) =>
                        _Player('value${obj(data)['version']}'),
                  ),
                );
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('value1'), findsOneWidget);
      expect(_Player.created, 1);
      session.invalidate();
      await tester.pump();
      await tester.pump();
      expect(find.text('value1'), findsOneWidget);
      expect(_Player.created, 1);
      pending.complete(http.Response('{"version":2}', 200));
      await tester.pumpAndSettle();
      expect(_Player.created, 1);
      expect(find.text('value2'), findsOneWidget);
      update(() => path = 'events/two');
      await tester.pumpAndSettle();
      expect(find.text('value1'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      session.dispose();
    },
  );
}
