/**
 * UV Active — Sensor Telemetry Reporter.
 *
 * Deliberately a thin, separate module rather than something baked
 * into ble.ts: ble.ts is the hardware layer and has zero knowledge of
 * auth/network/the cloud API today, and it should stay that way — a
 * device class that can independently decide to make network calls is
 * a debugging nightmare and a layering violation. This module sits
 * above both ble.ts and sessionsApi.ts and wires them together.
 *
 * Reports on:
 *  - Every CONNECTION-STATE CHANGE (idle/scanning/.../connected/error)
 *    — not every tick. A gym floor of 20 sensors ticking once a
 *    second must not turn into 20 req/s against the telemetry
 *    endpoint; state changes are naturally rare (per-sensor, a
 *    handful of times per session at most).
 *  - Battery, opportunistically, whenever it changes by >=1% AND at
 *    least BATTERY_REPORT_MIN_INTERVAL_MS has passed since the last
 *    battery report for that sensor — batteries drain slowly, no
 *    reason to spam a write on every tiny fluctuation the driver
 *    reports.
 *
 * Failures are swallowed (logged, not thrown) — see reportTelemetry's
 * doc comment in sessionsApi.ts: a dropped telemetry POST must never
 * disrupt a live session or BLE reconnection logic. Worst case, the
 * dashboard is a beat stale.
 */
import { addGlobalBLEListener, type PolarDeviceStatus } from './ble';
import { sensorsApi } from './sessionsApi';

const BATTERY_REPORT_MIN_INTERVAL_MS = 60_000;

interface ReportedState {
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  battery: number;
  lastBatteryReportMs: number;
}

let unsubscribe: (() => void) | null = null;
let generation = 0;
const lastReported = new Map<string, ReportedState>();

/** ble.ts's raw state → the three-value vocabulary the connectivity dashboard actually cares about. isStale (session-scoped >15s silence) maps to 'reconnecting' even though ble.ts still reports the BLE link itself as 'connected' — the dashboard should read this exactly the way a trainer's live tile does. */
function toDashboardState(status: PolarDeviceStatus): 'connected' | 'reconnecting' | 'disconnected' {
  if (status.state === 'connected') return status.isStale ? 'reconnecting' : 'connected';
  if (status.state === 'connecting' || status.state === 'discovering' || status.state === 'scanning') return 'reconnecting';
  return 'disconnected'; // idle | disconnected | error
}

function maybeReport(deviceId: string, status: PolarDeviceStatus, sessionId?: string) {
  const dashboardState = toDashboardState(status);
  const prev = lastReported.get(deviceId);
  const now = Date.now();

  const stateChanged = !prev || prev.connectionState !== dashboardState;
  const batteryKnown = status.battery >= 0;
  const batteryChanged = batteryKnown && (!prev || prev.battery !== status.battery);
  const batteryDue = batteryChanged && (!prev || now - prev.lastBatteryReportMs >= BATTERY_REPORT_MIN_INTERVAL_MS || stateChanged);

  if (!stateChanged && !batteryDue) return;

  lastReported.set(deviceId, {
    connectionState: dashboardState,
    battery: status.battery,
    lastBatteryReportMs: batteryDue ? now : (prev?.lastBatteryReportMs ?? 0),
  });

  sensorsApi
    .reportTelemetry(deviceId, {
      connectionState: dashboardState,
      ...(batteryKnown ? { batteryPct: status.battery } : {}),
      ...(sessionId ? { sessionId } : {}),
    })
    .catch((e) => console.warn('[telemetryReporter] report failed (non-fatal):', e));
}

/**
 * Start bridging every BLE status update to the telemetry endpoint.
 * Safe to call from both the pre-flight sensor-assign step (no
 * sessionId yet — the dashboard just shows "connected, no active
 * session") and from sessionEngine on session start (sessionId
 * attaches so the portal can link a sensor back to what it was used
 * for). Calling start() again while already running just re-attaches
 * the sessionId to future reports — cheap, idempotent.
 */
export function startTelemetryReporting(sessionId?: string) {
  const myGeneration = ++generation;
  unsubscribe?.();
  unsubscribe = addGlobalBLEListener((deviceId, status) => maybeReport(deviceId, status, sessionId));
  return myGeneration;
}

/**
 * Stop reporting, but only if `expectGeneration` (if given) still
 * matches the current one. Exists specifically for React cleanup
 * effects: SessionSetupScreen's pre-flight step starts reporting on
 * mount and stops on unmount, but pressing "Start Session" calls
 * sessionEngine.startSession() — which starts its OWN, session-scoped
 * reporting — strictly before the screen unmounts and its cleanup
 * fires. Without the generation guard, that unmount-time stop would
 * tear down the session's reporting a beat after it began. Callers
 * that don't care about this (sessionEngine's own teardown) can omit
 * the argument and always stop unconditionally.
 */
export function stopTelemetryReporting(expectGeneration?: number) {
  if (expectGeneration !== undefined && expectGeneration !== generation) return;
  unsubscribe?.();
  unsubscribe = null;
}
