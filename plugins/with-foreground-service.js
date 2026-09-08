/**
 * UV Active — Foreground Service + Battery Optimization Plugin v1.0
 *
 * WHY THIS EXISTS:
 *   Android Doze mode suspends network/radio activity when the device is:
 *     - Stationary + unplugged + screen off for an extended period
 *   Even with WAKE_LOCK and expo-keep-awake, Doze fires independently and
 *   can interrupt the BLE connection to sensors mid-session.
 *
 *   For a gym tablet (plugged in, screen always on during sessions) this is
 *   unlikely to trigger. For a phone used as the trainer device, it's real.
 *
 * WHAT THIS DOES:
 *   1. Adds REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission to AndroidManifest.
 *      The app can then call:
 *        import { requestBatteryOptimizationExemption } from '../utils/battery';
 *      to prompt the user to whitelist UV Active from battery optimization.
 *
 *   2. Marks the FOREGROUND_SERVICE as type="connectedDevice" (Android 14+
 *      requires explicit foreground service types — generic services are rejected).
 *
 *   Note: Showing the system battery optimization dialog requires the user to
 *   manually approve. It cannot be done silently. Prompt once after first login,
 *   only if the device is not a tablet / always-on display.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const withForegroundService = (config) => {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // 1. Add REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission
    const permissions = manifest['uses-permission'] || [];
    const batteryPermission = 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS';
    const alreadyHas = permissions.some(
      (p) => p?.$?.['android:name'] === batteryPermission
    );
    if (!alreadyHas) {
      permissions.push({ $: { 'android:name': batteryPermission } });
      manifest['uses-permission'] = permissions;
      console.log('[foreground-service] ✓ REQUEST_IGNORE_BATTERY_OPTIMIZATIONS added');
    }

    // 2. Find the FOREGROUND_SERVICE declaration and add foregroundServiceType
    const app = manifest.application?.[0];
    if (app) {
      const services = app.service || [];
      for (const svc of services) {
        const perms = svc?.['$']?.['android:permission'];
        if (perms === 'android.permission.FOREGROUND_SERVICE') {
          if (!svc.$['android:foregroundServiceType']) {
            svc.$['android:foregroundServiceType'] = 'connectedDevice';
            console.log('[foreground-service] ✓ foregroundServiceType=connectedDevice set');
          }
        }
      }
    }

    return mod;
  });
};

module.exports = withForegroundService;
