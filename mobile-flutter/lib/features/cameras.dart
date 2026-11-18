import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;
import '../core/api.dart';
import '../core/media_lifecycle.dart';
import '../core/domain.dart';
import '../core/session.dart';
import '../ui/shared.dart';

class CamerasScreen extends StatelessWidget {
  const CamerasScreen({super.key});
  @override
  Widget build(BuildContext context) => ResourcePane(
    path: 'streams',
    legacy: true,
    builder: (context, data, reload) => PageFrame(
      title: 'Cámaras',
      subtitle: 'Mirar cámaras ya conectadas a tu hogar.',
      children: [
        const BannerNote(
          'La configuración inicial de cámaras y sensores se realiza desde la web. La app solo utiliza los equipos existentes.',
        ),
        if (rows(data).isEmpty)
          const Section(
            title: 'Tus cámaras',
            children: [
              EmptyState(
                title: 'Sin cámaras registradas',
                description:
                    'Agregá una webcam desde Conexiones en la computadora.',
                icon: Icons.videocam_off_outlined,
              ),
            ],
          ),
        ...rows(data).map(
          (c) => Section(
            title: txt(c['nombre']),
            trailing: StatusBadge(
              c['conectada'] == true ? 'ONLINE' : 'OFFLINE',
            ),
            children: [
              Text(
                c['conectada'] == true
                    ? 'Hay una transmisión disponible.'
                    : 'Esperando una transmisión desde el sistema web.',
                style: const TextStyle(color: muted),
              ),
              gap(),
              OutlinedButton.icon(
                onPressed: () => openPage(
                  context,
                  txt(c['nombre']),
                  CameraScreen(camera: c),
                ),
                icon: const Icon(Icons.videocam_outlined),
                label: const Text('Abrir cámara'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class CameraScreen extends StatefulWidget {
  final Json camera;
  const CameraScreen({super.key, required this.camera});
  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen>
    with WidgetsBindingObserver {
  final renderer = RTCVideoRenderer();
  RTCPeerConnection? peer;
  MediaStream? source;
  bool publishing = false, rendererDisposed = false;
  http.Client? transport, analysisClient;
  Timer? renewal;
  StreamSubscription<String>? analysisSubscription;
  ApiClient? api;
  String? leaseToken;
  Uri? mediaEndpoint;
  bool busy = false, connected = false, rendererReady = false;
  String message = 'Pulsá Ver transmisión para comenzar.';
  Json analysis = {};
  int generation = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    api ??= AppScope.of(context).api;
  }

  Future<void> start({bool publish = false}) async {
    if (busy) return;
    await stop();
    if (!mounted) return;
    setState(() {
      busy = true;
      publishing = publish;
    });
    final gen = ++generation;
    try {
      if (!rendererReady) {
        await renderer.initialize();
        rendererReady = true;
      }
      if (!mounted || gen != generation) {
        if (!mounted && !rendererDisposed) {
          rendererDisposed = true;
          await renderer.dispose();
        }
        return;
      }
      final lease = obj(
        await api!.post('streams', {
          'type': publish ? 'publish' : 'view',
          'cameraId': widget.camera['id'],
          'remote': true,
        }, legacy: true),
      );
      leaseToken = txt(lease['token']);
      if (!mounted || gen != generation) {
        await stop();
        return;
      }
      final path = txt(lease['path']);
      if (!RegExp(r'^camera-\d+-[a-f0-9-]+$').hasMatch(path)) {
        throw StateError('La dirección de video no es válida.');
      }
      final pc = await createPeerConnection({'iceServers': []});
      peer = pc;
      pc.onTrack = (event) {
        if (mounted && gen == generation && event.streams.isNotEmpty) {
          renderer.srcObject = event.streams.first;
        }
      };
      pc.onConnectionState = (state) {
        if (!mounted || gen != generation) return;
        if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
          setState(() {
            connected = true;
            message = publishing
                ? 'Transmitiendo desde este teléfono'
                : 'Video en vivo · conexión autorizada';
          });
        } else if ([
          RTCPeerConnectionState.RTCPeerConnectionStateFailed,
          RTCPeerConnectionState.RTCPeerConnectionStateDisconnected,
        ].contains(state)) {
          unawaited(stop());
          setState(
            () => message =
                'Se perdió la transmisión. Podés volver a conectarte.',
          );
        }
      };
      if (publish) {
        source = await navigator.mediaDevices.getUserMedia({
          'video': {
            'facingMode': 'environment',
            'width': 640,
            'height': 480,
            'frameRate': 15,
          },
          'audio': false,
        });
        if (!mounted || gen != generation) {
          await stop();
          return;
        }
        renderer.srcObject = source;
        for (final track in source!.getVideoTracks()) {
          await pc.addTrack(track, source!);
        }
      } else {
        await pc.addTransceiver(
          kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
          init: RTCRtpTransceiverInit(direction: TransceiverDirection.RecvOnly),
        );
      }
      await pc.setLocalDescription(await pc.createOffer());
      final ice = Completer<void>();
      pc.onIceGatheringState = (state) {
        if (state == RTCIceGatheringState.RTCIceGatheringStateComplete &&
            !ice.isCompleted) {
          markIceComplete(ice);
        }
      };
      if (await pc.getIceGatheringState() ==
          RTCIceGatheringState.RTCIceGatheringStateComplete) {
        markIceComplete(ice);
      }
      await ice.future.timeout(const Duration(seconds: 8));
      if (!mounted || gen != generation) {
        await stop();
        return;
      }
      final base = Uri.parse(api!.origin).replace(
        port: const int.fromEnvironment(
          'HOMEGUARD_MEDIA_PORT',
          defaultValue: 8889,
        ),
      );
      final endpoint = base.replace(
        path: '/$path/${publish ? 'whip' : 'whep'}',
      );
      final client = http.Client();
      transport = client;
      final local = await pc.getLocalDescription();
      final request = http.Request('POST', endpoint)
        ..followRedirects = false
        ..headers.addAll({
          'Content-Type': 'application/sdp',
          'Authorization': 'Bearer $leaseToken',
        })
        ..body = local!.sdp!;
      final result = await client
          .send(request)
          .timeout(const Duration(seconds: 12));
      final sdp = await result.stream.bytesToString();
      if (result.statusCode != 201 && result.statusCode != 200) {
        throw StateError(
          'El servidor de video no está disponible (${result.statusCode}). Comprobá que la cámara esté transmitiendo y que el servicio de video esté encendido en la PC.',
        );
      }
      final location = result.headers['location'];
      if (location != null) {
        final locationUri = endpoint.resolve(location);
        if (locationUri.origin != base.origin ||
            !locationUri.path.startsWith('/$path/')) {
          throw StateError(
            'La respuesta de video no corresponde a esta cámara.',
          );
        }
        mediaEndpoint = locationUri;
      }
      if (!mounted || gen != generation) {
        await stop();
        return;
      }
      final accepted = await commitCameraNegotiation(
        pc.setRemoteDescription(RTCSessionDescription(sdp, 'answer')),
        () => mounted && gen == generation,
        () {
          renewal = Timer.periodic(const Duration(seconds: 10), (_) {
            unawaited(
              api!
                  .post('streams', {
                    'action': 'renew',
                    'token': leaseToken,
                  }, legacy: true)
                  .catchError((Object _) {
                    if (mounted) {
                      setState(() => message = 'La sesión de cámara venció.');
                      unawaited(stop());
                    }
                    return <String, dynamic>{};
                  }),
            );
          });
          _startAnalysis(gen);
        },
      );
      if (!accepted) return;
      if (mounted) {
        setState(
          () => message = connected
              ? 'Video en vivo · conexión autorizada'
              : 'Esperando señal de video…',
        );
      }
    } catch (e) {
      await stop();
      if (mounted) setState(() => message = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _startAnalysis(int gen) {
    final client = http.Client();
    analysisClient = client;
    final request =
        http.Request(
            'GET',
            api!.uri('analysis?cameraId=${widget.camera['id']}', legacy: true),
          )
          ..headers.addAll(api!.headers)
          ..followRedirects = false;
    unawaited(
      client
          .send(request)
          .timeout(const Duration(seconds: 10))
          .then(
            (response) {
              if (!mounted || gen != generation) {
                client.close();
                return;
              }
              if (response.statusCode == 200) {
                analysisSubscription = response.stream
                    .transform(utf8.decoder)
                    .transform(const LineSplitter())
                    .listen(
                      (line) {
                        if (line.startsWith('data:') &&
                            mounted &&
                            gen == generation) {
                          try {
                            setState(
                              () => analysis = obj(
                                jsonDecode(line.substring(5).trim()),
                              ),
                            );
                          } catch (_) {}
                        }
                      },
                      onError: (_) {
                        if (mounted) {
                          setState(() => analysis = {'status': 'unavailable'});
                        }
                      },
                    );
              }
            },
            onError: (Object _) {
              if (mounted) setState(() => analysis = {'status': 'unavailable'});
            },
          ),
    );
  }

  Future<void> stop() async {
    generation++;
    renewal?.cancel();
    renewal = null;
    await analysisSubscription?.cancel();
    analysisSubscription = null;
    analysisClient?.close();
    analysisClient = null;
    final oldPeer = peer;
    peer = null;
    await oldPeer?.close();
    if (rendererReady && !rendererDisposed) renderer.srcObject = null;
    final captured = source;
    source = null;
    if (captured != null) {
      for (final track in captured.getTracks()) {
        await track.stop();
      }
      await captured.dispose();
    }
    final endpoint = mediaEndpoint, token = leaseToken;
    mediaEndpoint = null;
    leaseToken = null;
    transport?.close();
    transport = null;
    if (mounted) setState(() => connected = false);
    if (endpoint != null && token != null) {
      final client = http.Client();
      try {
        await client
            .delete(endpoint, headers: {'Authorization': 'Bearer $token'})
            .timeout(const Duration(seconds: 3));
      } catch (_) {
      } finally {
        client.close();
      }
    }
    if (token != null) {
      try {
        await api?.post('streams', {
          'action': 'close',
          'token': token,
        }, legacy: true);
      } catch (_) {}
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (shouldPauseCamera(state)) unawaited(stop());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(
      stop().whenComplete(() async {
        if (rendererReady && !rendererDisposed) {
          rendererDisposed = true;
          await renderer.dispose();
        }
      }),
    );
    super.dispose();
  }

  Future<void> enroll() async {
    final details = await showDialog<Json>(
      context: context,
      builder: (_) => const _EnrollmentDialog(),
    );
    if (details == null || !mounted) return;
    await api!.post('analysis', {
      'action': 'enroll',
      'cameraId': widget.camera['id'],
      ...details,
    }, legacy: true);
    if (mounted) {
      showMessage(
        context,
        'Registro facial iniciado. La persona debe estar frente a la cámara que ya transmite.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final admin = AppScope.of(context).user!.admin;
    return PageFrame(
      title: txt(widget.camera['nombre']),
      children: [
        Section(
          title: 'Vista de la cámara',
          trailing: StatusBadge(connected ? 'ONLINE' : 'OFFLINE'),
          children: [
            Container(
              height: 220,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(12),
              ),
              child: rendererReady
                  ? RTCVideoView(
                      renderer,
                      objectFit:
                          RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
                    )
                  : const Center(
                      child: Icon(
                        Icons.videocam_off_outlined,
                        color: Colors.white54,
                        size: 40,
                      ),
                    ),
            ),
            gap(),
            Text(message),
            gap(),
            FilledButton.icon(
              onPressed: busy || connected ? null : start,
              icon: const Icon(Icons.play_arrow),
              label: Text(busy ? 'Conectando…' : 'Ver transmisión'),
            ),
            gap(8),
            OutlinedButton.icon(
              onPressed: busy || connected ? null : () => start(publish: true),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Transmitir desde este teléfono'),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Transmitir usa la cámara del teléfono para este registro existente. Mirar una transmisión no pide acceso a tu cámara.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ),
            OutlinedButton.icon(
              onPressed: () => stop(),
              icon: const Icon(Icons.stop),
              label: const Text('Detener'),
            ),
          ],
        ),
        Section(
          title: 'Análisis del servidor',
          subtitle:
              'Las detecciones dependen de la cámara y del servicio de inferencia existentes.',
          children: [
            Text(
              {
                    'live': 'Análisis activo',
                    'degraded': 'Reconocimiento facial degradado',
                    'connecting': 'Conectando',
                    'unavailable': 'Análisis no disponible',
                    'disconnected': 'Cámara desconectada',
                  }[analysis['status']] ??
                  'Esperando análisis',
            ),
            for (final d in rows(analysis['detections']))
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.center_focus_strong),
                title: Text(txt(d['label'])),
                subtitle: Text(txt(d['category'])),
              ),
            if (analysis['enrollment'] != null)
              Text(
                'Registro facial: ${obj(analysis['enrollment'])['count'] ?? 0} muestras · ${txt(obj(analysis['enrollment'])['status'])}',
              ),
          ],
        ),
        if (admin)
          Section(
            title: 'Perfiles faciales',
            subtitle:
                'Se usa el registro existente; no se agrega otra cámara al hogar.',
            children: [
              ActionButton(
                label: 'Registrar rostro con consentimiento',
                icon: Icons.person_add_alt_1,
                enabled: connected,
                action: enroll,
              ),
              ActionButton(
                label: 'Cancelar registro facial',
                secondary: true,
                action: () async {
                  await api!.post('analysis', {
                    'action': 'cancel',
                    'cameraId': widget.camera['id'],
                  }, legacy: true);
                },
              ),
            ],
          ),
      ],
    );
  }
}

class _EnrollmentDialog extends StatefulWidget {
  const _EnrollmentDialog();
  @override
  State<_EnrollmentDialog> createState() => _EnrollmentDialogState();
}

class _EnrollmentDialogState extends State<_EnrollmentDialog> {
  final name = TextEditingController();
  bool consent = false;
  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Registrar rostro'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: name,
            maxLength: 100,
            decoration: const InputDecoration(
              labelText: 'Nombre de la persona',
            ),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('La persona autoriza el registro de su rostro.'),
            value: consent,
            onChanged: (v) => setState(() => consent = v ?? false),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancelar'),
      ),
      FilledButton(
        onPressed: consent
            ? () {
                if (name.text.trim().isNotEmpty) {
                  Navigator.pop(context, {
                    'name': name.text.trim(),
                    'consent': true,
                  });
                }
              }
            : null,
        child: const Text('Iniciar registro'),
      ),
    ],
  );
}

class PeopleScreen extends StatelessWidget {
  const PeopleScreen({super.key});
  @override
  Widget build(BuildContext context) => ResourcePane(
    path: 'vision',
    legacy: true,
    builder: (context, data, reload) {
      final d = obj(data),
          profiles = rows(d['profiles']),
          session = AppScope.of(context);
      return PageFrame(
        title: 'Personas',
        subtitle: 'Perfiles faciales y encuentros de las cámaras.',
        children: [
          const BannerNote(
            'Las etiquetas avanzadas y la gestión completa de personas siguen pendientes en el sistema. Los perfiles faciales existentes se pueden consultar aquí.',
          ),
          Section(
            title: 'Perfiles registrados',
            children: [
              if (profiles.isEmpty)
                const EmptyState(
                  title: 'Sin perfiles faciales',
                  description:
                      'El administrador puede registrar un rostro desde una cámara existente con consentimiento.',
                ),
              for (final p in profiles)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    child: Icon(Icons.person_outline),
                  ),
                  title: Text(txt(p['nombre'])),
                  subtitle: Text(txt(p['modelo'])),
                  trailing: session.user!.admin
                      ? IconButton(
                          tooltip: 'Eliminar perfil',
                          icon: const Icon(Icons.delete_outline),
                          onPressed: () async {
                            if (!await askConfirmation(
                              context,
                              'Eliminar perfil',
                              'Se eliminará el perfil facial de ${p['nombre']}.',
                            )) {
                              return;
                            }
                            try {
                              await session.api.delete('vision', {
                                'id': p['id'],
                                'type': 'profile',
                              }, legacy: true);
                              session.invalidate();
                            } catch (e) {
                              if (context.mounted) showMessage(context, e);
                            }
                          },
                        )
                      : null,
                ),
            ],
          ),
          Section(
            title: 'Encuentros recientes',
            children: [
              if (rows(d['events']).isEmpty)
                const Text('Sin encuentros registrados.'),
              for (final e in rows(d['events']))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(txt(e['nombre'], txt(e['categoria']))),
                  subtitle: Text(boTime(e['fecha'])),
                ),
            ],
          ),
        ],
      );
    },
  );
}
