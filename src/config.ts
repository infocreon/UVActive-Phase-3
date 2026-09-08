/**
 * UV Active Trainer App — environment config.
 *
 * There is no hub IP to discover or configure anymore — the app talks
 * to one fixed cloud API base URL, supplied ONLY via the
 * EXPO_PUBLIC_API_BASE_URL env var. No backend URL is hardcoded here
 * or in eas.json — for local dev, set it in .env (see .env.example);
 * for EAS builds, set it as an "Environment Variable" on the EAS
 * project for each build profile (dev/preview/production), since a
 * local .env is not picked up by `eas build`. Failing loudly here
 * beats silently building against the wrong (or a stale) backend.
 */
if (!process.env.EXPO_PUBLIC_API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL is not set. Set it in .env for local dev, ' +
      'or as an EAS "Environment Variable" on this build profile — see .env.example.',
  );
}
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

// BLE connection concurrency — see bleScanMediator.ts for why this
// exists at all (Android's real GATT ceiling, not an arbitrary limit).
// Configurable per-gym from Settings; hard-capped here regardless of
// what a trainer sets, since hardware not software is what breaks
// above this.
export const DEFAULT_MAX_CONCURRENT_SENSORS = 6;
export const HARD_MAX_CONCURRENT_SENSORS = 10;

// A sensor with no valid HR packet for this long is flagged stale in
// the UI — matches the threshold already used inside ble.ts.
export const STALE_HR_MS = 15_000;

// How often the sync queue flusher wakes up to check for pending rows
// and network availability. Also triggered immediately on network
// state transitioning offline → online (see syncQueue.ts) — this
// interval is the fallback, not the primary trigger.
export const SYNC_POLL_INTERVAL_MS = 10_000;

// Batch size per flush — matches the cloud API's IngestSensorReadingsDto,
// which accepts an array of readings per call. Keep this well under any
// reasonable request-body size limit; ticks are tiny (memberId, ts, hr).
export const SYNC_BATCH_SIZE = 200;
