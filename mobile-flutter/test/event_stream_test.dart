import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:homeguard_mobile/core/api.dart';
import 'package:homeguard_mobile/core/event_stream.dart';

void main() {
  test(
    'SSE starts at latest and retained numeric cursor is used when resuming',
    () async {
      final api = ApiClient('http://localhost:3000')..token = 'test';
      String? after;
      late EventStream stream;
      stream = EventStream(
        api,
        (_) {
          expect(stream.cursor, '65');
          stream.close();
        },
        clients: () => MockClient((r) async {
          after = r.url.queryParameters['after'];
          return http.Response('id: 65\nevent: sync_ready\ndata: {}\n\n', 200);
        }),
      );
      await stream.start();
      expect(after, 'latest');
      late EventStream resumed;
      resumed = EventStream(
        api,
        (_) {
          resumed.close();
        },
        initialCursor: stream.cursor,
        clients: () => MockClient((r) async {
          expect(r.url.queryParameters['after'], '65');
          return http.Response(
            'id: 66\nevent: event.created\ndata: {"entity_id":"event"}\n\n',
            200,
          );
        }),
      );
      await resumed.start();
      expect(resumed.cursor, '66');
      api.close();
    },
  );
}
