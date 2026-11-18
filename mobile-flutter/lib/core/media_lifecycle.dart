import 'dart:async';
import 'package:flutter/widgets.dart';

// Android permission dialogs make the app inactive without backgrounding it.
bool shouldPauseCamera(AppLifecycleState state) => [
  AppLifecycleState.paused,
  AppLifecycleState.hidden,
  AppLifecycleState.detached,
].contains(state);
void markIceComplete(Completer<void> ice) {
  if (!ice.isCompleted) ice.complete();
}

Future<bool> commitCameraNegotiation(
  Future<void> negotiation,
  bool Function() isCurrent,
  VoidCallback startResources,
) async {
  await negotiation;
  if (!isCurrent()) return false;
  startResources();
  return true;
}
