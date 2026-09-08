/**
 * UV Active — Sensor Watchdog.
 *
 * Owns exactly two jobs, both scoped to the currently active session:
 *
 *  1. DISCONNECT DETECTION — a per-member "last REAL tick" clock. If a
 *     member's assigned sensor hasn't produced a genuine packet in
 *     GAP_THRESHOLD_MS (15s), the member enters "reconnecting" state.
 *     This is intentionally the same 15s threshold ble.ts already uses
 *     for its own isStale flag, kept independent on purpose: ble.ts
 *     answers "is the radio link healthy", this answers "does THIS
 *     session's scoring have a hole right now" — different consumers,
 *     same number, no shared code to keep them in sync.
 *
 *  2. GAP-FILL — while a member is reconnecting, synthesizes one BPM
 *     sample per second from THAT MEMBER'S own recent trend (never a
 *     flat global average, never another member's data) and feeds it
 *     through the exact same processTick() the real BLE path uses, so
 *     zoneSeconds / sweatPoints / recovery inputs stay continuous.
 *     Every synthetic tick is tagged `interpolated: true` end to end
 *     (accumulator + SQLite row) for internal QA — nothing in the
 *     trainer or member UI ever renders the word "interpolated",
 *     "gap", or "hardware" off the back of it. The UI only ever sees
 *     isReconnecting, which reads as a normal "reconnecting…" pill.
 *
 * Fill algorithm (deliberately simple, not a physiological model):
 *   - Take the member's recentRealSamples (last 30s of genuine ticks).
 *   - avg   = mean(bpm) over that window
 *   - trend = (last.bpm - first.bpm) / (last.ts - first.ts), bpm/sec
 *   - filled(t) = avg + trend * t, where t is seconds into the gap,
 *     with the trend's influence decayed via TREND_DECAY so a fill
 *     converges toward the plain average rather than running away
 *     (a real 15s ramp doesn't justify extrapolating a 90s ramp).
 *   - Clamped to [restingHr * 0.85, mhr * 1.05] as a physiological floor/
 *     ceiling — a fill can never itself manufacture a new peak HR or
 *     drop the member into an implausible bradycardic reading.
 *   - Fewer than MIN_SAMPLES_FOR_TREND real samples → flat-line the
 *     last known real BPM instead (not enough history to trend from).
 *
 * Bounded fabrication: after GAP_FILL_MAX_SECONDS (2 min) of continuous
 * fill, the watchdog stops synthesizing ticks entirely — a member who
 * has genuinely left keeps their score frozen at its last real value
 * rather than accumulating fabricated points indefinitely. The tile
 * stays in "reconnecting" state throughout; only the scoring stops.
 */
import type { SessionAccumulatorState } from '../lib/formula-engine';

export const GAP_THRESHOLD_MS = 15_000;
const WATCHDOG_TICK_MS = 1_000;
const MIN_SAMPLES_FOR_TREND = 3;
const TREND_DECAY_PER_SEC = 0.92; // trend contribution shrinks ~8%/sec of gap
export const GAP_FILL_MAX_SECONDS = 120;

export interface FillResult {
  bpm: number;
  cappedOut: boolean; // true once GAP_FILL_MAX_SECONDS has been exceeded — caller should stop calling processTick and just leave the tile in "reconnecting"
}

/**
 * Derive one synthetic BPM sample from a member's own recent real
 * samples. Pure function — no I/O, easy to unit test independent of
 * any BLE or timer plumbing.
 */
export function computeFillBpm(
  state: Pick<SessionAccumulatorState, 'recentRealSamples' | 'mhr' | 'restingHr'>,
  gapSeconds: number,
): FillResult {
  const cappedOut = gapSeconds > GAP_FILL_MAX_SECONDS;
  const samples = state.recentRealSamples;

  const floor = state.restingHr * 0.85;
  const ceiling = state.mhr * 1.05;
  const clamp = (v: number) => Math.min(ceiling, Math.max(floor, v));

  if (samples.length === 0) {
    // Nothing to trend from at all (dropped before a single real tick
    // landed this session) — hold at resting HR rather than inventing
    // a number with zero basis.
    return { bpm: Math.round(clamp(state.restingHr)), cappedOut };
  }

  const last = samples[samples.length - 1];
  if (samples.length < MIN_SAMPLES_FOR_TREND) {
    return { bpm: Math.round(clamp(last.bpm)), cappedOut };
  }

  const first = samples[0];
  const avg = samples.reduce((sum, s) => sum + s.bpm, 0) / samples.length;
  const spanSec = Math.max(1, (last.ts - first.ts) / 1000);
  const trendPerSec = (last.bpm - first.bpm) / spanSec;

  // Decayed trend projection from the last real reading, not from the
  // window average — the member's HR right now is closest to their
  // most recent real sample, trending toward the window average as
  // the gap lengthens.
  const decay = Math.pow(TREND_DECAY_PER_SEC, gapSeconds);
  const trendComponent = trendPerSec * gapSeconds * decay;
  const projected = last.bpm + trendComponent;
  const blended = projected * decay + avg * (1 - decay);

  return { bpm: Math.round(clamp(blended)), cappedOut };
}

/** Whether a member's watchdog clock says they need a fill tick right now. */
export function needsFill(lastRealTickMs: number, nowMs: number): boolean {
  return lastRealTickMs > 0 && nowMs - lastRealTickMs > GAP_THRESHOLD_MS;
}

export { WATCHDOG_TICK_MS };
