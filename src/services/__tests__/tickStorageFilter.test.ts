/**
 * Coverage for the adaptive tick-storage filter — the thing that
 * decides which real BPM readings actually earn a `ticks` row (and
 * therefore a cloud sensor_readings row / graph point), independent of
 * scoring, which always runs on every real reading regardless (see
 * tickStorageFilter.ts's file header).
 */
import { TickStorageFilter, MAX_KEEP_INTERVAL_MS, KEEP_BPM_DELTA } from '../tickStorageFilter';

const T0 = 1_700_000_000_000;

describe('TickStorageFilter — steady state (interval cap)', () => {
  it('always keeps the first tick for a member', () => {
    const f = new TickStorageFilter();
    expect(f.shouldKeep('m1', T0, 120, false)).toBe(true);
  });

  it('drops ticks that are neither far enough apart in time nor bpm', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false);
    // 5s later, bpm barely moved — below both thresholds
    expect(f.shouldKeep('m1', T0 + 5_000, 121, false)).toBe(false);
    expect(f.shouldKeep('m1', T0 + 10_000, 122, false)).toBe(false);
  });

  it('force-keeps once MAX_KEEP_INTERVAL_MS has elapsed since the last KEPT point, even with zero bpm movement', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false);
    expect(f.shouldKeep('m1', T0 + MAX_KEEP_INTERVAL_MS - 1, 120, false)).toBe(false);
    expect(f.shouldKeep('m1', T0 + MAX_KEEP_INTERVAL_MS, 120, false)).toBe(true);
  });

  it('measures the interval from the last KEPT point, not the last seen tick', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false); // kept
    expect(f.shouldKeep('m1', T0 + 8_000, 120, false)).toBe(false); // dropped, still the reference point
    // 14s after the dropped tick, but only 14s after the KEPT one too — still under cap
    expect(f.shouldKeep('m1', T0 + 14_000, 120, false)).toBe(false);
    // 15s after the last KEPT point (T0) — now force-kept
    expect(f.shouldKeep('m1', T0 + 15_000, 120, false)).toBe(true);
  });
});

describe('TickStorageFilter — spikes/recovery (change threshold)', () => {
  it('keeps a tick immediately once bpm moves by KEEP_BPM_DELTA, regardless of elapsed time', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false);
    expect(f.shouldKeep('m1', T0 + 1_000, 120 + KEEP_BPM_DELTA - 1, false)).toBe(false);
    expect(f.shouldKeep('m1', T0 + 1_000, 120 + KEEP_BPM_DELTA, false)).toBe(true);
  });

  it('reacts to a drop as readily as a rise', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 150, false);
    expect(f.shouldKeep('m1', T0 + 1_000, 150 - KEEP_BPM_DELTA, false)).toBe(true);
  });

  it('is dense through a fast ramp and sparse through the steady stretch that follows', () => {
    const f = new TickStorageFilter();
    let kept = 0;
    // 20s ramp, 1 real tick/sec, +5bpm/sec — should keep ~every tick
    for (let s = 0; s <= 20; s++) {
      if (f.shouldKeep('m1', T0 + s * 1000, 100 + s * 5, false)) kept++;
    }
    const rampKept = kept;
    expect(rampKept).toBeGreaterThan(15); // essentially every sample during the ramp

    // 60s steady state right after, flat bpm — should only keep ~4 (every 15s)
    kept = 0;
    for (let s = 1; s <= 60; s++) {
      if (f.shouldKeep('m1', T0 + 20_000 + s * 1000, 200, false)) kept++;
    }
    expect(kept).toBeLessThanOrEqual(5);
    expect(kept).toBeGreaterThanOrEqual(3);
  });
});

describe('TickStorageFilter — watchdog interpolated ticks', () => {
  it('always keeps interpolated ticks, even with no time or bpm movement', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false);
    expect(f.shouldKeep('m1', T0 + 1_000, 120, true)).toBe(true);
    expect(f.shouldKeep('m1', T0 + 2_000, 120, true)).toBe(true);
  });

  it('force-keeps the first REAL tick right after an interpolated stretch, then resumes normal thinning', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false);
    f.shouldKeep('m1', T0 + 16_000, 118, true); // watchdog fill during a dropout

    // Reconnect: first real tick is force-kept regardless of tiny elapsed/delta
    expect(f.shouldKeep('m1', T0 + 17_000, 118, false)).toBe(true);
    // Normal thinning resumes, measured from that reconnect point
    expect(f.shouldKeep('m1', T0 + 18_000, 119, false)).toBe(false);
  });
});

describe('TickStorageFilter — multi-member isolation and reset', () => {
  it('tracks each member independently', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false);
    // m2's first tick is independently force-kept even though m1 already has a reference point
    expect(f.shouldKeep('m2', T0 + 1_000, 200, false)).toBe(true);
  });

  it('reset() clears a member so their next tick is force-kept again', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false);
    expect(f.shouldKeep('m1', T0 + 1_000, 121, false)).toBe(false);
    f.reset('m1');
    expect(f.shouldKeep('m1', T0 + 1_001, 121, false)).toBe(true);
  });

  it('clear() resets every member', () => {
    const f = new TickStorageFilter();
    f.shouldKeep('m1', T0, 120, false);
    f.shouldKeep('m2', T0, 200, false);
    f.clear();
    expect(f.shouldKeep('m1', T0 + 1, 120, false)).toBe(true);
    expect(f.shouldKeep('m2', T0 + 1, 200, false)).toBe(true);
  });
});
