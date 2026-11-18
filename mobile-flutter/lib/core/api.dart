import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'domain.dart';

class ApiException implements Exception {
  final int status;
  final String code, message;
  const ApiException(this.status, this.code, this.message);
  @override
  String toString() => message;
}

class ApiClient {
  final http.Client _client;
  final String origin;
  String? token;
  void Function()? onUnauthorized;
  ApiClient(String server, {http.Client? client})
    : origin = serverOrigin(server),
      _client = client ?? http.Client();
  Uri uri(String path, {bool legacy = false}) {
    if (path.startsWith('/') ||
        path.contains('..') ||
        path.contains('://') ||
        path.contains('#')) {
      throw const FormatException('Ruta de aplicación no válida.');
    }
    return Uri.parse('$origin/api/${legacy ? '' : 'v1/'}$path');
  }

  Map<String, String> get headers => {
    if (token != null) 'Authorization': 'Bearer $token',
    'Accept': 'application/json',
  };
  Future<dynamic> get(String path, {bool legacy = false}) =>
      request('GET', path, legacy: legacy);
  Future<dynamic> post(String path, Json data, {bool legacy = false}) =>
      request('POST', path, data: data, legacy: legacy);
  Future<dynamic> patch(String path, Json data) =>
      request('PATCH', path, data: data);
  Future<dynamic> put(String path, Json data) =>
      request('PUT', path, data: data);
  Future<dynamic> delete(String path, Json data, {bool legacy = false}) =>
      request('DELETE', path, data: data, legacy: legacy);
  Future<dynamic> request(
    String method,
    String path, {
    Json? data,
    bool legacy = false,
  }) async {
    if (method == 'POST' &&
        ((!legacy && path.split('?').first == 'connections') ||
            (legacy && path.split('?').first == 'vision'))) {
      throw UnsupportedError(
        'Las altas de cámaras y sensores se realizan desde la web.',
      );
    }
    final request = http.Request(method, uri(path, legacy: legacy))
      ..followRedirects = false
      ..headers.addAll(headers);
    if (method != 'GET') {
      request.headers['Idempotency-Key'] = const Uuid().v4();
    }
    if (data != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(data);
    }
    try {
      final response = await _client
          .send(request)
          .timeout(const Duration(seconds: 20));
      final text = await response.stream.bytesToString().timeout(
        const Duration(seconds: 20),
      );
      if (response.statusCode == 401 && path != 'auth/login') {
        token = null;
        onUnauthorized?.call();
      }
      dynamic decoded;
      try {
        decoded = jsonDecode(text);
      } catch (_) {
        throw ApiException(
          response.statusCode,
          'INVALID_RESPONSE',
          'El servidor devolvió una respuesta no válida.',
        );
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = obj(obj(decoded)['error']);
        throw ApiException(
          response.statusCode,
          txt(error['code'], 'REQUEST_FAILED'),
          txt(error['message'], 'No se pudo completar la solicitud.'),
        );
      }
      return decoded;
    } on TimeoutException {
      throw const ApiException(
        0,
        'TIMEOUT',
        'El servidor tardó demasiado. Revisá la conexión e intentá nuevamente.',
      );
    } on http.ClientException {
      throw const ApiException(
        0,
        'OFFLINE',
        'No se pudo conectar con el servidor del hogar. Revisá la dirección y la red Wi-Fi.',
      );
    }
  }

  Future<List<int>> bytes(String path) async {
    final request = http.Request('GET', uri(path))
      ..followRedirects = false
      ..headers.addAll(headers);
    final response = await _client
        .send(request)
        .timeout(const Duration(seconds: 20));
    if (response.statusCode == 401) {
      token = null;
      onUnauthorized?.call();
    }
    if (response.statusCode != 200) {
      await response.stream.drain<void>();
      throw const ApiException(
        0,
        'MEDIA_UNAVAILABLE',
        'El archivo no está disponible.',
      );
    }
    return response.stream.toBytes().timeout(const Duration(seconds: 30));
  }

  void close() => _client.close();
}
