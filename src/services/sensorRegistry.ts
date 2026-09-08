/**
 * UV Active Trainer App — local sensor registry.
 *
 * The cloud API has no trainer-facing endpoint to persist sensor↔member
 * assignments (sensor inventory management lives on the Branch Portal;
 * /branch/sensors is branch_manager-only). BLE hardware connections and
 * per-session assignments are the trainer's own business, so we persist
 * them locally on-device:
 *
 *   • Registered sensor list  — the Polar device IDs this trainer uses
 *     (survives restarts; reconnects automatically like the old app's
 *     saved-sensor list).
 *   • Member assignments     — memberId → sensorDeviceId, applied as
 *     DEFAULTS the next time a session is configured/started, and shown
 *     on member profiles and the Sensors screen.
 *
 * Storage: expo-secure-store (the only key-value store already in the
 * project). Values are tiny (a handful of device IDs), well under the
 * platform size limits.
 */
import * as SecureStore from 'expo-secure-store';

const SENSOR_LIST_KEY = 'uva_sensor_list_v1';
const ASSIGNMENTS_KEY = 'uva_sensor_assignments_v1';

// ── Registered sensor list ───────────────────────────────────────────

export async function getRegisteredSensors(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(SENSOR_LIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function addRegisteredSensor(deviceId: string): Promise<string[]> {
  const id = deviceId.trim().toUpperCase();
  const list = await getRegisteredSensors();
  const next = list.includes(id) ? list : [...list, id];
  await SecureStore.setItemAsync(SENSOR_LIST_KEY, JSON.stringify(next));
  return next;
}

export async function removeRegisteredSensor(deviceId: string): Promise<string[]> {
  const id = deviceId.trim().toUpperCase();
  const next = (await getRegisteredSensors()).filter((x) => x !== id);
  await SecureStore.setItemAsync(SENSOR_LIST_KEY, JSON.stringify(next));
  return next;
}

// ── Member ↔ sensor assignments ──────────────────────────────────────

export async function getSensorAssignments(): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(ASSIGNMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Assign a sensor to a member (persists; one sensor per member). */
export async function assignSensorToMember(memberId: string, deviceId: string): Promise<Record<string, string>> {
  const map = await getSensorAssignments();
  // Reassigning a sensor already assigned to someone else moves it.
  const next: Record<string, string> = {};
  for (const [m, d] of Object.entries(map)) {
    if (d === deviceId && m !== memberId) continue;
    next[m] = d;
  }
  next[memberId] = deviceId;
  await SecureStore.setItemAsync(ASSIGNMENTS_KEY, JSON.stringify(next));
  return next;
}

export async function unassignMemberSensor(memberId: string): Promise<Record<string, string>> {
  const map = await getSensorAssignments();
  delete map[memberId];
  await SecureStore.setItemAsync(ASSIGNMENTS_KEY, JSON.stringify(map));
  return map;
}

/** Reverse lookup — which member (if any) is assigned to a device id. */
export async function memberForSensor(deviceId: string): Promise<string | null> {
  const map = await getSensorAssignments();
  const id = deviceId.trim().toUpperCase();
  for (const [memberId, dev] of Object.entries(map)) {
    if (dev.toUpperCase() === id) return memberId;
  }
  return null;
}
