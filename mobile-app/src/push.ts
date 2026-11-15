import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import type { Api } from "./domain";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
export async function installationId() {
  let id = await SecureStore.getItemAsync("hg-installation");
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync("hg-installation", id);
  }
  return id;
}
export async function registerInstallation(api: Api) {
  if (!Device.isDevice)
    throw new Error(
      "Probá las notificaciones remotas en un teléfono físico con development build.",
    );
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId)
    throw new Error(
      "Falta configurar el proyecto Expo/FCM. El historial y las emergencias locales siguen disponibles.",
    );
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("homeguard-events", {
      name: "Eventos HomeGuard",
      importance: AndroidImportance.HIGH,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted")
    permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error(
      "Permiso de notificaciones denegado. Podés habilitarlo en los ajustes de Android.",
    );
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await api("push-devices", {
    method: "POST",
    body: JSON.stringify({
      installation_id: await installationId(),
      token: token.data,
      platform: "android",
    }),
  });
  return "Dispositivo registrado. Enviá una prueba desde la web y verificá la recepción.";
}
