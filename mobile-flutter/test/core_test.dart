import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:homeguard_mobile/core/api.dart';
import 'package:homeguard_mobile/core/domain.dart';

void main() {
  test(
    'server origins reject credentials, paths and schemes that could leak a session',
    () {
      expect(
        serverOrigin(' http://192.168.1.4:3000/ '),
        'http://192.168.1.4:3000',
      );
      for (final input in [
        'http://example.com',
        'file:///secret',
        'https://a:b@host',
        'https://host/api',
        'https://host?token=x',
      ]) {
        expect(() => serverOrigin(input), throwsFormatException);
      }
    },
  );
  test(
    'requests use mobile bearer and idempotency; never follow remote redirects',
    () async {
      final client = ApiClient(
        'http://127.0.0.1:3000',
        client: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer private-test');
          expect(request.headers['idempotency-key'], isNotEmpty);
          expect(jsonDecode(request.body)['state'], 'ON');
          return http.Response('{"status":"QUEUED"}', 202);
        }),
      );
      client.token = 'private-test';
      expect(
        await client.post('connections/id/commands', {
          'channel': 'main',
          'state': 'ON',
        }),
        {'status': 'QUEUED'},
      );
      await expectLater(
        client.get('https://remote.invalid/path'),
        throwsFormatException,
      );
      client.close();
    },
  );
  test(
    '401 clears authorization, while permission denial keeps the valid session',
    () async {
      var expired = 0, status = 403;
      final api = ApiClient(
        'http://localhost:3000',
        client: MockClient(
          (_) async => http.Response(
            '{"error":{"code":"DENIED","message":"Sin acceso"}}',
            status,
          ),
        ),
      );
      api.token = 'secret';
      api.onUnauthorized = () {
        expired++;
      };
      await expectLater(api.get('members'), throwsA(isA<ApiException>()));
      expect(expired, 0);
      status = 401;
      await expectLater(api.get('connections'), throwsA(isA<ApiException>()));
      expect(expired, 1);
      expect(api.token, isNull);
      api.close();
    },
  );
  test(
    'notification routes accept UUID entity IDs only, never arbitrary URLs or actions',
    () {
      const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      expect(notificationTarget({'event_id': id})?.id, id);
      expect(notificationTarget({'incident_id': id})?.kind, 'incident');
      expect(
        notificationTarget({'event_id': 'https://remote.invalid'}),
        isNull,
      );
      expect(notificationTarget({'action': 'REQUEST_HELP'}), isNull);
    },
  );
  test('missing hardware readings stay empty and timestamps use Bolivia', () {
    expect(
      readingLabel({'type': 'TEMPERATURE', 'unit': '°C', 'last_value': null}),
      'Sin lecturas',
    );
    expect(readingLabel({'type': 'DOOR', 'last_value': false}), 'Cerrada');
    expect(
      readingLabel({'type': 'POWER', 'unit': 'W', 'last_value': 0}),
      '0 W',
    );
    expect(boTime('2026-11-17T12:00:00Z'), contains('08:00'));
  });
  test('mobile client refuses hardware registration endpoints', () async {
    var sent = false;
    final api = ApiClient(
      'http://localhost:3000',
      client: MockClient((_) async {
        sent = true;
        return http.Response('{}', 200);
      }),
    );
    await expectLater(
      api.post('connections', {'kind': 'SENSOR'}),
      throwsA(isA<UnsupportedError>()),
    );
    await expectLater(
      api.post('vision', {
        'action': 'camera',
        'name': 'New camera',
      }, legacy: true),
      throwsA(isA<UnsupportedError>()),
    );
    expect(sent, false);
    api.close();
  });
  test(
    'foreground notices respect notification decisions and explicit emergency override',
    () {
      final now = DateTime.utc(2026, 11, 17, 14);
      final prefs = {
        'categories': ['SECURITY'],
        'quiet_start': '09:00',
        'quiet_end': '11:00',
        'critical_demo_override': true,
      };
      final event = {
        'category': 'SECURITY',
        'decisions': {'notify_requested': false},
      };
      expect(
        allowedNotification(
          {
            'categories': ['SECURITY'],
          },
          event,
          now,
        ),
        false,
      );
      expect(
        allowedNotification(prefs, event, now, emergencyChallenge: true),
        true,
      );
      expect(
        allowedNotification(
          {...prefs, 'critical_demo_override': false},
          event,
          now,
          emergencyChallenge: true,
        ),
        false,
      );
    },
  );
}
