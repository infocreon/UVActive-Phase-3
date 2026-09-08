/**
 * Network connectivity monitor.
 *
 * The old networkMonitor.ts existed to trigger hub rediscovery on a
 * WiFi/SSID change — that entire problem doesn't exist anymore (no
 * hub to lose track of). All the sync queue actually needs is "are we
 * online right now" and "let me know when that changes" — this file
 * is deliberately that small.
 */
import * as Network from 'expo-network';

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let _online = true;
let _pollTimer: ReturnType<typeof setInterval> | null = null;

export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch {
    // If the check itself fails, assume online rather than blocking a
    // sync attempt that might well succeed — the request itself is the
    // real test; this is just an optimization to avoid pointless
    // attempts while very obviously offline (airplane mode, etc.).
    return true;
  }
}

export function addNetworkListener(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function _setOnline(next: boolean) {
  if (next === _online) return;
  _online = next;
  for (const fn of listeners) fn(next);
}

/** Starts a lightweight poll (network state changes aren't always reliably event-driven across Android OEMs). */
export function startNetworkMonitor() {
  if (_pollTimer) return;
  isOnline().then(_setOnline);
  _pollTimer = setInterval(() => {
    isOnline().then(_setOnline);
  }, 5_000);
}

export function stopNetworkMonitor() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = null;
}
