import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/domain.dart';
import '../core/session.dart';

const brand = Color(0xff16765b),
    ink = Color(0xff203831),
    muted = Color(0xff65766d),
    canvas = Color(0xfff5f7f5);
ThemeData homeTheme() => ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: brand,
    brightness: Brightness.light,
  ),
  scaffoldBackgroundColor: canvas,
  appBarTheme: const AppBarTheme(
    backgroundColor: canvas,
    foregroundColor: ink,
    elevation: 0,
  ),
  cardTheme: CardThemeData(
    color: Colors.white,
    elevation: 0,
    margin: const EdgeInsets.only(bottom: 16),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: Color(0xffe1e8e2)),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: Colors.white,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      minimumSize: const Size(44, 48),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      minimumSize: const Size(44, 48),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  ),
  textTheme: const TextTheme(
    headlineMedium: TextStyle(
      fontSize: 27,
      fontWeight: FontWeight.w700,
      color: ink,
    ),
    titleLarge: TextStyle(
      fontSize: 20,
      fontWeight: FontWeight.w700,
      color: ink,
    ),
    bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: ink),
  ),
);

class PageFrame extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> children;
  final Widget? action;
  const PageFrame({
    super.key,
    required this.title,
    this.subtitle,
    required this.children,
    this.action,
  });
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(18, 16, 18, 36),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineMedium),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Text(subtitle!, style: const TextStyle(color: muted)),
        ],
        if (action != null) ...[const SizedBox(height: 12), action!],
        const SizedBox(height: 22),
        ...children,
      ],
    ),
  );
}

class Section extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> children;
  final Widget? trailing;
  const Section({
    super.key,
    required this.title,
    this.subtitle,
    required this.children,
    this.trailing,
  });
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 5),
            Text(subtitle!, style: const TextStyle(color: muted, fontSize: 12)),
          ],
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    ),
  );
}

class BannerNote extends StatelessWidget {
  final String text;
  final bool error;
  const BannerNote(this.text, {super.key, this.error = false});
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: error
          ? Theme.of(context).colorScheme.errorContainer
          : const Color(0xffe8f3ed),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          error ? Icons.error_outline : Icons.info_outline,
          color: error ? Theme.of(context).colorScheme.error : brand,
          size: 20,
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(text)),
      ],
    ),
  );
}

class StatusBadge extends StatelessWidget {
  final dynamic value;
  final String? text;
  const StatusBadge(this.value, {super.key, this.text});
  @override
  Widget build(BuildContext context) {
    final bad = ['OFFLINE', 'FAILED', 'CRITICAL', 'EXPIRED'].contains(value),
        warm = [
          'WAITING',
          'PENDING',
          'QUEUED',
          'NEEDS_REVIEW',
          'SIMULATED',
        ].contains(value);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bad
            ? const Color(0xffffe8e8)
            : warm
            ? const Color(0xfffff0dc)
            : const Color(0xffe8f3ed),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text ?? label(value),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: bad
              ? const Color(0xff9c3030)
              : warm
              ? const Color(0xff7d5422)
              : brand,
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final String title, description;
  final IconData icon;
  const EmptyState({
    super.key,
    required this.title,
    required this.description,
    this.icon = Icons.inbox_outlined,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 25),
    child: Column(
      children: [
        Icon(icon, size: 38, color: brand),
        const SizedBox(height: 12),
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          description,
          textAlign: TextAlign.center,
          style: const TextStyle(color: muted),
        ),
      ],
    ),
  );
}

void showMessage(BuildContext context, Object message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message.toString()),
      behavior: SnackBarBehavior.floating,
    ),
  );
}

Future<bool> askConfirmation(
  BuildContext context,
  String title,
  String message,
) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    ) ??
    false;
void openPage(BuildContext context, String title, Widget body) =>
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: Text(title)),
          body: SafeArea(child: body),
        ),
      ),
    );

class ActionButton extends StatefulWidget {
  final String label;
  final Future<void> Function() action;
  final IconData? icon;
  final bool enabled, danger, secondary;
  const ActionButton({
    super.key,
    required this.label,
    required this.action,
    this.icon,
    this.enabled = true,
    this.danger = false,
    this.secondary = false,
  });
  @override
  State<ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<ActionButton> {
  bool busy = false;
  @override
  Widget build(BuildContext context) {
    Future<void> run() async {
      setState(() => busy = true);
      try {
        await widget.action();
      } catch (e) {
        if (context.mounted) showMessage(context, e);
      } finally {
        if (mounted) setState(() => busy = false);
      }
    }

    final child = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (busy)
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        else if (widget.icon != null)
          Icon(widget.icon, size: 18),
        if (busy || widget.icon != null) const SizedBox(width: 8),
        Flexible(
          child: Text(
            busy ? 'Procesando…' : widget.label,
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: widget.secondary
          ? OutlinedButton(
              onPressed: widget.enabled && !busy ? run : null,
              child: child,
            )
          : FilledButton(
              style: widget.danger
                  ? FilledButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.error,
                    )
                  : null,
              onPressed: widget.enabled && !busy ? run : null,
              child: child,
            ),
    );
  }
}

typedef ResourceBuilder =
    Widget Function(BuildContext context, dynamic data, VoidCallback reload);

class ResourcePane extends StatefulWidget {
  final String? path;
  final bool legacy;
  final Future<dynamic> Function(ApiClient)? load;
  final ResourceBuilder builder;
  final int refreshSeconds;
  final String? cacheKey;
  const ResourcePane({
    super.key,
    this.path,
    this.legacy = false,
    this.load,
    required this.builder,
    this.refreshSeconds = 10,
    this.cacheKey,
  });
  @override
  State<ResourcePane> createState() => _ResourcePaneState();
}

class _ResourcePaneState extends State<ResourcePane>
    with WidgetsBindingObserver {
  SessionController? session;
  Future<dynamic>? future;
  Timer? timer;
  bool fetching = false, active = true;
  int scope = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    timer = Timer.periodic(
      Duration(
        seconds: widget.refreshSeconds > 0 ? widget.refreshSeconds : 3600,
      ),
      (_) {
        if (widget.refreshSeconds > 0 && active) reload();
      },
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = AppScope.of(context);
    if (session != next) {
      session?.refresh.removeListener(reload);
      session = next;
      session!.refresh.addListener(reload);
      _fetch();
    }
  }

  @override
  void didUpdateWidget(ResourcePane old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path || old.cacheKey != widget.cacheKey) {
      scope++;
      fetching = false;
      _fetch();
    }
  }

  void _fetch() {
    if (fetching || session?.user == null) return;
    fetching = true;
    final currentScope = scope;
    future =
        (widget.load?.call(session!.api) ??
                session!.api.get(widget.path!, legacy: widget.legacy))
            .then(
              (value) {
                if (currentScope == scope) fetching = false;
                return value;
              },
              onError: (Object error, StackTrace stack) {
                if (currentScope == scope) fetching = false;
                Error.throwWithStackTrace(error, stack);
              },
            );
  }

  void reload() {
    if (!mounted || fetching) return;
    setState(_fetch);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    active = state == AppLifecycleState.resumed;
    if (active) reload();
  }

  @override
  void dispose() {
    timer?.cancel();
    session?.refresh.removeListener(reload);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<dynamic>(
    key: ValueKey(scope),
    future: future,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return PageFrame(
          title: 'No se pudo actualizar',
          children: [
            BannerNote('${snapshot.error}', error: true),
            OutlinedButton.icon(
              onPressed: reload,
              icon: const Icon(Icons.refresh),
              label: const Text('Volver a intentar'),
            ),
          ],
        );
      }
      if (snapshot.connectionState != ConnectionState.done &&
          !snapshot.hasData) {
        return const Center(
          child: Padding(
            padding: EdgeInsets.all(40),
            child: CircularProgressIndicator(),
          ),
        );
      }
      return Stack(
        children: [
          widget.builder(context, snapshot.data, reload),
          if (snapshot.connectionState != ConnectionState.done)
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(),
            ),
        ],
      );
    },
  );
}

Widget gap([double size = 12]) => SizedBox(height: size);
Widget badges(Iterable<dynamic> values) => Wrap(
  spacing: 6,
  runSpacing: 6,
  children: values.map((v) => StatusBadge(v)).toList(),
);
