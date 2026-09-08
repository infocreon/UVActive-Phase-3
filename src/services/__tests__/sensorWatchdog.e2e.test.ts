/**
 * End-to-end coverage for the sensor watchdog + gap-fill pipeline.
 *
 * These tests exercise the REAL formula-engine (createAccumulator /
 * processTick / finalizeSummary) together with the REAL watchdog pure
 * functions (needsFill / computeFillBpm) — the exact same functions
 * sessionEngine.ts's runWatchdogTick() calls — rather than mocking
 * either side. That's deliberate: the bug this suite would have
 * caught (see the "credits exactly N seconds" test) was a real
 * integration bug between the two modules that neither module's
 * logic alone would have exposed — processTick's 5s catch-up cap for
 * ORGANIC ticks was silently wrong when fed a SYNTHETIC tick whose
 * timestamp already reflected a >15s gap.
 */
import { createAccumulator, processTick, finalizeSummary } from '../../lib/formula-engine/session';
import type { MemberProfile } from '../../lib/formula-engine/types';
import { computeFillBpm, needsFill, GAP_FILL_MAX_SECONDS } from '../sensorWatchdog';

const PROFILE: MemberProfile = { age: 32, sex: 'male', weightKg: 78, heightCm: 178, restingHr: 62, storedMhr: 188, sessionCount: 12 };
const T0 = 1_700_000_000_000; // fixed epoch so tests are deterministic

describe('sensor watchdog — disconnect detection', () => {
  it('does not fire before the 15s threshold', () => {
    expect(needsFill(T0, T0 + 14_999)).toBe(false);
  });

  it('fires once the gap exceeds 15s', () => {
    expect(needsFill(T0, T0 + 15_001)).toBe(true);
  });

  it('never fires for a member who has never had a real tick (lastRealTickMs=0 sentinel)', () => {
    expect(needsFill(0, T0 + 999_999)).toBe(false);
  });
});

describe('sensor watchdog — gap-fill / processTick integration', () => {
  it('credits exactly one second per watchdog tick through a >15s gap — no under- or over-crediting', () => {
    let state = createAccumulator(PROFILE, 'm1');
    for (let s = 0; s < 40; s++) {
      const bpm = 90 + Math.round((150 - 90) * (s / 39));
      state = processTick(state, { memberId: 'm1', ts: T0 + s * 1000, bpm }, 'Test Member').state;
    }
    const zoneSecondsBefore = state.zoneSeconds.reduce((a, b) => a + b, 0);
    const lastReal = T0 + 39_000;

    let fillCount = 0;
    for (let gapMs = 1000; gapMs <= 22_000; gapMs += 1000) {
      const now = lastReal + gapMs;
      if (!needsFill(lastReal, now)) continue;
      const { bpm, cappedOut } = computeFillBpm(state, gapMs / 1000);
      expect(cappedOut).toBe(false);
      state = processTick(state, { memberId: 'm1', ts: now, bpm, interpolated: true }, 'Test Member').state;
      fillCount++;
    }

    expect(fillCount).toBe(7); // seconds 16..22
    expect(state.consecutiveInterpolatedSeconds).toBe(7);
    const zoneSecondsAfter = state.zoneSeconds.reduce((a, b) => a + b, 0);
    expect(zoneSecondsAfter).toBe(zoneSecondsBefore + 7); // full, even credit — the bug this test guards against under-credited to zoneSecondsBefore + 11
  });

  it('flags isReconnecting=true on every interpolated tick and clears it on the next real tick', () => {
    let state = createAccumulator(PROFILE, 'm1');
    let result = processTick(state, { memberId: 'm1', ts: T0, bpm: 140 }, 'Test Member');
    state = result.state;
    expect(result.liveTick.isReconnecting).toBe(false);

    result = processTick(state, { memberId: 'm1', ts: T0 + 16_000, bpm: 138, interpolated: true }, 'Test Member');
    state = result.state;
    expect(result.liveTick.isReconnecting).toBe(true);

    result = processTick(state, { memberId: 'm1', ts: T0 + 17_000, bpm: 137 }, 'Test Member');
    expect(result.liveTick.isReconnecting).toBe(false);
    expect(result.state.consecutiveInterpolatedSeconds).toBe(0);
  });

  it('clamps a fill to physiological bounds even with an extreme trend', () => {
    let state = createAccumulator(PROFILE, 'm1');
    // Two real samples with a huge upward slope over a short span.
    state = processTick(state, { memberId: 'm1', ts: T0, bpm: 100 }, 'Test Member').state;
    state = processTick(state, { memberId: 'm1', ts: T0 + 1000, bpm: 100 }, 'Test Member').state;
    state = processTick(state, { memberId: 'm1', ts: T0 + 2000, bpm: 185 }, 'Test Member').state;

    const { bpm } = computeFillBpm(state, 40); // project 40s into a long gap
    expect(bpm).toBeLessThanOrEqual(Math.round(state.mhr * 1.05));
    expect(bpm).toBeGreaterThanOrEqual(Math.round(state.restingHr * 0.85));
  });

  it('reports cappedOut once a gap exceeds GAP_FILL_MAX_SECONDS, so sessionEngine stops fabricating data', () => {
    const state = createAccumulator(PROFILE, 'ghost');
    const stateWithOneSample = processTick(state, { memberId: 'ghost', ts: T0, bpm: 140 }, 'Ghost').state;
    const { cappedOut } = computeFillBpm(stateWithOneSample, GAP_FILL_MAX_SECONDS + 30);
    expect(cappedOut).toBe(true);
  });

  it('holds at resting HR when a member has zero real samples to trend from (dropped before their first real tick)', () => {
    const state = createAccumulator(PROFILE, 'never-worn');
    const { bpm } = computeFillBpm(state, 20);
    expect(bpm).toBe(Math.round(PROFILE.restingHr * 0.85 > PROFILE.restingHr ? PROFILE.restingHr * 0.85 : PROFILE.restingHr));
  });
});

describe('sensor watchdog — multi-member isolation', () => {
  it('never leaks one member\'s interpolated state into another member\'s accumulator', () => {
    let stateA = createAccumulator({ ...PROFILE, storedMhr: 192 }, 'A');
    let stateB = createAccumulator({ ...PROFILE, storedMhr: 175 }, 'B');

    for (let s = 0; s < 20; s++) {
      stateA = processTick(stateA, { memberId: 'A', ts: T0 + s * 1000, bpm: 150 }, 'A').state;
      stateB = processTick(stateB, { memberId: 'B', ts: T0 + s * 1000, bpm: 130 }, 'B').state;
    }

    const lastRealA = T0 + 19_000;
    for (let gapMs = 1000; gapMs <= 18_000; gapMs += 1000) {
      const now = lastRealA + gapMs;
      stateB = processTick(stateB, { memberId: 'B', ts: T0 + (20 + gapMs / 1000 - 1) * 1000, bpm: 131 }, 'B').state;
      if (!needsFill(lastRealA, now)) continue;
      const { bpm } = computeFillBpm(stateA, gapMs / 1000);
      stateA = processTick(stateA, { memberId: 'A', ts: now, bpm, interpolated: true }, 'A').state;
    }

    expect(stateB.consecutiveInterpolatedSeconds).toBe(0);
    expect(stateB.totalInterpolatedSeconds).toBe(0);
    expect(stateA.totalInterpolatedSeconds).toBe(3); // seconds 16,17,18
    expect(stateA.mhr).not.toBe(stateB.mhr);
  });
});

describe('sensor watchdog — session finalize stays consistent with interpolated ticks in the mix', () => {
  it('exposes totalInterpolatedSeconds on the final summary for ops/QA, without it affecting sweatPoints validity', () => {
    let state = createAccumulator(PROFILE, 'm1');
    for (let s = 0; s < 40; s++) {
      state = processTick(state, { memberId: 'm1', ts: T0 + s * 1000, bpm: 140 }, 'Test Member').state;
    }
    for (let gapMs = 16000; gapMs <= 20000; gapMs += 1000) {
      const { bpm } = computeFillBpm(state, gapMs / 1000);
      state = processTick(state, { memberId: 'm1', ts: T0 + 39_000 + gapMs, bpm, interpolated: true }, 'Test Member').state;
    }

    const summary = finalizeSummary({ state, durationHours: 1 });
    expect(summary.totalInterpolatedSeconds).toBe(5);
    expect(summary.sweatPoints).toBeGreaterThan(0);
    expect(Number.isFinite(summary.avgHr)).toBe(true);
  });
});
