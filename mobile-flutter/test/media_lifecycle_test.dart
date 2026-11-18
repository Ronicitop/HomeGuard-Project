import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:homeguard_mobile/core/media_lifecycle.dart';

void main() {
  test(
    'Android permission-dialog inactive state does not cancel camera capture',
    () {
      expect(shouldPauseCamera(AppLifecycleState.inactive), false);
      expect(shouldPauseCamera(AppLifecycleState.resumed), false);
      for (final state in [
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
        AppLifecycleState.detached,
      ]) {
        expect(shouldPauseCamera(state), true);
      }
    },
  );
  test(
    'ICE callback and status snapshot may both report complete safely',
    () async {
      final ice = Completer<void>();
      markIceComplete(ice);
      markIceComplete(ice);
      await ice.future;
    },
  );
  test(
    'negotiation completing after disposal cannot start renewal or analysis',
    () async {
      final answer = Completer<void>();
      var current = true, created = 0;
      final pending = commitCameraNegotiation(
        answer.future,
        () => current,
        () => created++,
      );
      current = false;
      answer.complete();
      expect(await pending, false);
      expect(created, 0);
      expect(
        await commitCameraNegotiation(
          Future.value(),
          () => true,
          () => created++,
        ),
        true,
      );
      expect(created, 1);
    },
  );
}
