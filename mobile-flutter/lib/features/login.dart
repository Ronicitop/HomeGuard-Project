import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import '../core/session.dart';
import '../ui/shared.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController(),
      password = TextEditingController(),
      server = TextEditingController();
  final form = GlobalKey<FormState>();
  bool busy = false, hidden = true;
  String? error;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (server.text.isEmpty) server.text = AppScope.of(context).api.origin;
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    server.dispose();
    super.dispose();
  }

  Future<void> login() async {
    if (!form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      await AppScope.of(context).signIn(server.text, email.text, password.text);
      password.clear();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Form(
              key: form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.shield_outlined, color: brand, size: 56),
                  gap(),
                  Text(
                    'homeguard.',
                    textAlign: TextAlign.center,
                    style: Theme.of(
                      context,
                    ).textTheme.headlineMedium?.copyWith(fontSize: 34),
                  ),
                  gap(),
                  const Text(
                    'Tu hogar, siempre cerca',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: muted, fontSize: 18),
                  ),
                  gap(30),
                  Text(
                    'Bienvenido',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  gap(8),
                  const Text('Usá la misma cuenta que en el sistema web.'),
                  gap(20),
                  if (error != null || AppScope.of(context).error != null)
                    BannerNote(
                      error ?? AppScope.of(context).error!,
                      error: true,
                    ),
                  TextFormField(
                    controller: email,
                    enabled: !busy,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.username],
                    decoration: const InputDecoration(
                      labelText: 'Correo electrónico',
                      prefixIcon: Icon(Icons.mail_outline),
                    ),
                    validator: (v) => v != null && v.contains('@')
                        ? null
                        : 'Ingresá un correo válido.',
                  ),
                  gap(16),
                  TextFormField(
                    controller: password,
                    enabled: !busy,
                    obscureText: hidden,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Contraseña',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        tooltip: hidden
                            ? 'Mostrar contraseña'
                            : 'Ocultar contraseña',
                        onPressed: () => setState(() => hidden = !hidden),
                        icon: Icon(
                          hidden
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                    validator: (v) => v == null || v.isEmpty
                        ? 'Ingresá tu contraseña.'
                        : null,
                    onFieldSubmitted: (_) {
                      if (!busy) login();
                    },
                  ),
                  gap(16),
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: const Text('Conexión con mi hogar'),
                    subtitle: Text(
                      server.text,
                      overflow: TextOverflow.ellipsis,
                    ),
                    children: [
                      TextFormField(
                        controller: server,
                        enabled: !busy,
                        keyboardType: TextInputType.url,
                        decoration: const InputDecoration(
                          labelText: 'Dirección del servidor',
                          hintText: 'http://192.168.1.50:3000',
                        ),
                        validator: (v) => v == null || v.isEmpty
                            ? 'Indicá la dirección de tu PC.'
                            : null,
                      ),
                      gap(),
                      Text(
                        kIsWeb
                            ? 'Vista de desarrollo Flutter. En un teléfono físico usá la IP privada de tu PC.'
                            : 'Usá la IP de la computadora que ejecuta HomeGuard y conectá el teléfono a la misma red Wi-Fi. 10.0.2.2 es para el emulador Android.',
                        style: const TextStyle(color: muted, fontSize: 12),
                      ),
                      gap(),
                    ],
                  ),
                  gap(18),
                  FilledButton(
                    onPressed: busy ? null : login,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: busy
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Entrar a mi hogar'),
                    ),
                  ),
                  gap(22),
                  const Text(
                    'Prototipo universitario · Las emergencias utilizan una central simulada.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: muted),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
