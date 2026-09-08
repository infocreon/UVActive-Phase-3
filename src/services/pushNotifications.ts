import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api';

// Foreground behaviour — without this, a push that arrives while the
// app is open and focused is silently swallowed by default on iOS.
// A trainer mid-session needs to actually see a disconnect/reassign
// alert even with the app already in front of them.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests notification permission, resolves this device's Expo push
 * token, and registers it with the Cloud API so server-side notify()
 * calls (session cancelled, reassignment needed, sync issues, etc.)
 * reach this device as a real system push — not just the in-app bell.
 *
 * Called on every successful login AND on every app boot with a
 * restored session (see hooks/useAuth.tsx) — Expo push tokens can
 * rotate, so re-registering on each app open keeps the backend's
 * stored token current rather than only ever capturing it once.
 *
 * Best-effort throughout: a denied permission, a simulator with no
 * push capability, or a registration network failure should never
 * block login or crash the app — this quietly no-ops and the trainer
 * just doesn't get phone-level pushes until it succeeds.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators/emulators have no push capability

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    await api.post('/trainer/me/push-token', { token: tokenResponse.data });
  } catch (e) {
    console.warn('[pushNotifications] registration failed (non-fatal):', e);
  }
}

/** Clears the registered token server-side on logout, so a shared/reset device stops receiving another trainer's pushes. Best-effort — logout must proceed even if this fails. */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    await api.post('/trainer/me/push-token', { token: null });
  } catch (e) {
    console.warn('[pushNotifications] unregister failed (non-fatal):', e);
  }
}
