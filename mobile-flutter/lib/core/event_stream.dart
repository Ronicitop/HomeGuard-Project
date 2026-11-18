import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api.dart';
import 'domain.dart';

class ServerSignal {
  final String event, id;
  final Json data;
  const ServerSignal(this.event, this.id, this.data);
}

class EventStream {
  final ApiClient api;
  final void Function(ServerSignal) onSignal;
  http.Client? _client;
  bool _stopped = false;
  String cursor;
  final http.Client Function() _clients;
  EventStream(
    this.api,
    this.onSignal, {
    String initialCursor = 'latest',
    http.Client Function()? clients,
  }) : cursor = initialCursor,
       _clients = clients ?? http.Client.new;
  Future<void> start() async {
    while (!_stopped && api.token != null) {
      final client = _clients();
      _client = client;
      try {
        final request = http.Request('GET', api.uri('stream?after=$cursor'))
          ..followRedirects = false
          ..headers.addAll({...api.headers, 'Accept': 'text/event-stream'});
        final response = await client
            .send(request)
            .timeout(const Duration(seconds: 12));
        if (response.statusCode == 401) {
          api.token = null;
          api.onUnauthorized?.call();
          return;
        }
        if (response.statusCode != 200) throw StateError('SSE unavailable');
        String event = 'message', id = '';
        final data = <String>[];
        await for (final line
            in response.stream
                .transform(utf8.decoder)
                .transform(const LineSplitter())) {
          if (_stopped) break;
          if (line.isEmpty) {
            if (data.isNotEmpty) {
              try {
                if (RegExp(r'^\d+$').hasMatch(id)) cursor = id;
                onSignal(
                  ServerSignal(event, id, obj(jsonDecode(data.join('\n')))),
                );
              } catch (_) {}
            }
            event = 'message';
            id = '';
            data.clear();
          } else if (line.startsWith('event:')) {
            event = line.substring(6).trim();
          } else if (line.startsWith('id:')) {
            id = line.substring(3).trim();
          } else if (line.startsWith('data:')) {
            data.add(line.substring(5).trimLeft());
          }
        }
      } catch (_) {
        /* Resource screens expose connection failures and retry independently. */
      } finally {
        client.close();
      }
      if (!_stopped) await Future<void>.delayed(const Duration(seconds: 3));
    }
  }

  void close() {
    _stopped = true;
    _client?.close();
  }
}
