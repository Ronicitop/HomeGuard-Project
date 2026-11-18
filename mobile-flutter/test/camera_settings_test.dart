import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:homeguard_mobile/core/api.dart';
import 'package:homeguard_mobile/core/session.dart';
import 'package:homeguard_mobile/features/cameras.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'widget_test.dart' show sessionFor;

void main() {
  for (final role in ['ADMINISTRADOR', 'RESIDENTE']) {
    testWidgets('Interruptores de cámara para $role', (tester) async {
      final session = sessionFor(role);
      final settings = {
        'people': true,
        'faces': true,
        'pets': true,
        'motion': false,
        'posture': false,
      };
      final requests = <Map<String, dynamic>>[];
      session.api.close();
      session.api = ApiClient(
        'http://localhost:3000',
        client: MockClient((request) async {
          expect(request.url.path, '/api/camera-settings');
          requests.add(jsonDecode(request.body));
          return http.Response(
            jsonEncode({
              'detection_revision': 2,
              'detection_settings': {...settings, 'posture': true},
            }),
            200,
          );
        }),
      );
      session.api.token = 'test-token';
      await tester.pumpWidget(
        AppScope(
          session: session,
          child: MaterialApp(
            home: Scaffold(
              body: CameraScreen(
                camera: {
                  'id': 7,
                  'nombre': 'Patio',
                  'detection_settings': settings,
                  'detection_revision': 1,
                },
              ),
            ),
          ),
        ),
      );
      final posture = find.widgetWithText(SwitchListTile, 'Postura');
      await tester.ensureVisible(posture);
      final tile = tester.widget<SwitchListTile>(posture);
      expect(tile.value, false);
      if (role == 'ADMINISTRADOR') {
        await tester.tap(posture);
        await tester.pumpAndSettle();
        expect(requests.single, {
          'cameraId': 7,
          'feature': 'posture',
          'enabled': true,
        });
        expect(tester.widget<SwitchListTile>(posture).value, true);
      } else {
        expect(tile.onChanged, isNull);
        expect(requests, isEmpty);
      }
      await tester.pumpWidget(const SizedBox.shrink());
      session.dispose();
    });
  }
}
