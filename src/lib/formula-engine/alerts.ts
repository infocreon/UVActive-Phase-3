import type { AlertEvent, SessionAccumulatorState, Zone } from "./types";

/** Trainer alert thresholds, PDF page 9-10 — data table, not hardcoded logic, so copy/wording can be tuned without touching the evaluator below. */
export const ALERT_DEFINITIONS = {
  zone1TooLong: { message: "Member may need encouragement", severity: "info" as const },
  zone5Sustained: { message: "Check intensity — sustained peak", severity: "warning" as const },
  notRecoveringDuringRest: { message: "Not recovering — extend rest", severity: "warning" as const },
  belowBaseline: { message: "Below normal intensity today", severity: "info" as const },
  riseStalled: { message: "Member may be fatigued", severity: "info" as const },
  sensorDropout: { message: "Sensor connection lost", severity: "error" as const },
};

const ZONE1_TOO_LONG_SECONDS = 3 * 60; // "> 3 min"
const ZONE5_SUSTAINED_SECONDS = 90; // "> 90 continuous seconds"
const BELOW_BASELINE_BPM = 10; // "10+ bpm below personal baseline"
const SENSOR_DROPOUT_SECONDS = 10; // "> 10 seconds"

/**
 * Evaluate the always-on, zone/continuity-based alerts against one
 * member's current accumulator state. Call once per tick; the caller
 * is responsible for de-duplicating (don't refire the same alert every
 * single second — e.g. only emit on the tick where a threshold is
 * first crossed, tracked by the caller alongside the accumulator).
 */
export function evaluateContinuousAlerts(state: SessionAccumulatorState, isWorkBlock: boolean): AlertEvent[] {
  const events: AlertEvent[] = [];

  if (isWorkBlock && state.currentZone === 1 && state.secondsInCurrentZone > ZONE1_TOO_LONG_SECONDS) {
    events.push({ memberId: state.memberId, code: "zone1TooLong", ...ALERT_DEFINITIONS.zone1TooLong });
  }

  if (state.currentZone === 5 && state.secondsInCurrentZone > ZONE5_SUSTAINED_SECONDS) {
    events.push({ memberId: state.memberId, code: "zone5Sustained", ...ALERT_DEFINITIONS.zone5Sustained });
  }

  return events;
}

/**
 * "HR not dropping during rest period" — call when a rest interval has
 * been running for at least 60s; pass the HR at rest-start and the
 * current HR. Fires if the drop is under a small effective-zero
 * threshold (near-zero decline counts as "not recovering").
 */
export function checkNotRecoveringDuringRest(hrAtRestStart: number, currentHr: number, restSeconds: number, minRestSecondsBeforeCheck = 60): AlertEvent | null {
  if (restSeconds < minRestSecondsBeforeCheck) return null;
  const drop = hrAtRestStart - currentHr;
  if (drop <= 2) {
    return { memberId: "", code: "notRecoveringDuringRest", ...ALERT_DEFINITIONS.notRecoveringDuringRest };
  }
  return null;
}

/** "HR 10+ bpm below personal baseline" — compare today's current HR at a given point against the member's typical HR at the equivalent point historically. */
export function checkBelowBaseline(currentHr: number, personalBaselineHr: number): AlertEvent | null {
  if (personalBaselineHr - currentHr >= BELOW_BASELINE_BPM) {
    return { memberId: "", code: "belowBaseline", ...ALERT_DEFINITIONS.belowBaseline };
  }
  return null;
}

/** "HR rise stalled mid-interval" — HR has plateaued (near-zero net change) partway through a work interval that should still be ramping. */
export function checkRiseStalled(hrSamples: number[], minSamples = 15): AlertEvent | null {
  if (hrSamples.length < minSamples) return null;
  const recent = hrSamples.slice(-minSamples);
  const delta = recent[recent.length - 1] - recent[0];
  if (Math.abs(delta) <= 2) {
    return { memberId: "", code: "riseStalled", ...ALERT_DEFINITIONS.riseStalled };
  }
  return null;
}

/** "Sensor dropout > 10 seconds" — caller tracks seconds since last valid tick per sensor and calls this once that gap is known. */
export function checkSensorDropout(secondsSinceLastTick: number): AlertEvent | null {
  if (secondsSinceLastTick > SENSOR_DROPOUT_SECONDS) {
    return { memberId: "", code: "sensorDropout", ...ALERT_DEFINITIONS.sensorDropout };
  }
  return null;
}

/** Re-exported for callers that need the raw zone type without importing types.ts directly. */
export type { Zone };
