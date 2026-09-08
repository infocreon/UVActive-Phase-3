import type { RecoveryGrade } from "./types";

/**
 * End-of-session Recovery Points (standard) — PDF page 4.
 * recovPoints = peakHR - recovHR, where peakHR is the max HR observed
 * during a 2-minute high-intensity challenge and recovHR is the lowest
 * HR in the 60 seconds after the member stands still.
 * Worked example in the PDF: peak 181, recovery60 154 -> 27.
 */
export function computeEndOfSessionRecoveryPoints(peakHr: number, recoveryHr60s: number): number {
  return peakHr - recoveryHr60s;
}

export interface IntervalRecovery {
  intervalPeakHr: number;
  hrAt30s: number;
  hrAt60s: number;
}

export interface IntervalRecoveryResult {
  intervalRecovery30: number;
  intervalRecovery60: number;
  /** bpm drop per 10 seconds, PDF page 5. */
  recovRatePer10s: number;
}

/**
 * UV Active improvement — per-interval recovery tracking (PDF page 5).
 * Call at the end of every work interval, once 60s of rest data is available.
 */
export function computeIntervalRecovery(input: IntervalRecovery): IntervalRecoveryResult {
  const { intervalPeakHr, hrAt30s, hrAt60s } = input;
  return {
    intervalRecovery30: intervalPeakHr - hrAt30s,
    intervalRecovery60: intervalPeakHr - hrAt60s,
    recovRatePer10s: (intervalPeakHr - hrAt60s) / 6,
  };
}

/**
 * Recovery Points grading scale, PDF page 5 — bpm drop in 60s -> grade.
 * Boundaries are inclusive on the lower bound of each named tier.
 */
export function gradeRecoveryPoints(bpmDropIn60s: number): RecoveryGrade {
  if (bpmDropIn60s >= 55) return "Elite";
  if (bpmDropIn60s >= 40) return "Excellent";
  if (bpmDropIn60s >= 30) return "Good";
  if (bpmDropIn60s >= 20) return "Average";
  if (bpmDropIn60s >= 12) return "Building";
  return "Needs work";
}

export const RECOVERY_GRADE_RECOMMENDATION: Record<RecoveryGrade, string> = {
  Elite: "Feature on leaderboard",
  Excellent: "Maintain and celebrate",
  Good: "Keep zone distribution balanced",
  Average: "Add 2x zone 2 sessions/week",
  Building: "Zone 2 focus for 4 weeks",
  "Needs work": "See trainer for programme",
};

/** Standard HRR calculation, PDF page 7. */
export function computeHrrScore(peakHr: number, hrAt60s: number): number {
  return peakHr - hrAt60s;
}

/** Normalised HRR — accounts for different peak HR levels, PDF page 7. */
export function computeHrrNormalised(peakHr: number, hrAt60s: number): number {
  if (peakHr <= 0) return 0;
  return ((peakHr - hrAt60s) / peakHr) * 100;
}

/** Rolling 4-session HRR average, PDF page 7. Pass the last 4 HRR scores, most recent last (order doesn't affect the mean, kept for caller clarity). */
export function computeHrrTrend(lastFourHrr: number[]): number | null {
  if (lastFourHrr.length === 0) return null;
  return lastFourHrr.reduce((a, b) => a + b, 0) / lastFourHrr.length;
}

/** "Personal best recovery" flag — fires when today's HRR beats the rolling trend by >10%, PDF page 7. */
export function isPersonalBestRecovery(currentHrr: number, hrrTrend: number | null): boolean {
  if (hrrTrend === null) return false;
  return currentHrr > hrrTrend * 1.1;
}
