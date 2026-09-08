import type { Sex } from "./types";

/**
 * Formula A — Standard (default, ages 18-40).
 * MHR = 220 - age
 */
export function mhrStandard(age: number): number {
  return 220 - age;
}

/**
 * Formula B — Tanaka (40+ or female).
 * MHR = 208 - (0.7 * age)
 */
export function mhrTanaka(age: number): number {
  return 208 - 0.7 * age;
}

/**
 * Picks the right formula per PDF Module 01: Tanaka for members over 40
 * or when sex is recorded as female; Standard otherwise. Result is
 * rounded to the nearest whole bpm — MHR is always displayed/stored as
 * an integer.
 */
export function computeMhr(age: number, sex: Sex): number {
  const useTanaka = age > 40 || sex === "female";
  const raw = useTanaka ? mhrTanaka(age) : mhrStandard(age);
  return Math.round(raw);
}

export interface AdaptiveMhrInput {
  storedMhr: number;
  sessionPeakHr: number;
  /** Peak HR from each of the last 5 completed sessions, oldest first, NOT including the current one. */
  lastFivePeaks?: number[];
  /** Peak HR from each of the last 10+ completed sessions, oldest first, for the decrease-only rule. */
  lastTenPeaksForDecrease?: number[];
}

export interface AdaptiveMhrResult {
  /** True if this single session's peak exceeded the stored MHR — surface the "we noticed a new peak" prompt, do NOT auto-apply. */
  shouldPromptMemberConfirmation: boolean;
  proposedMhr: number | null;
  /** True if the 5-session consistent-overshoot rule fired — this one auto-applies. */
  autoUpdated: boolean;
  autoUpdatedMhr: number | null;
  /** True if the 10+-consecutive-sessions-below rule fired — MHR should be lowered. Never fires from a single low session. */
  autoDecreased: boolean;
  autoDecreasedMhr: number | null;
}

/**
 * Adaptive MHR update rule, PDF Module 01:
 *  - Single session peak > stored MHR  -> propose, ask the member, never auto-apply.
 *  - avgPeak over the last 5 sessions > storedMhr * 1.02 -> auto-update.
 *  - Only decrease after 10+ CONSECUTIVE sessions below the estimate — never
 *    from a single low session (illness/fatigue/poor sleep can suppress peak HR).
 */
export function evaluateAdaptiveMhr(input: AdaptiveMhrInput): AdaptiveMhrResult {
  const { storedMhr, sessionPeakHr, lastFivePeaks, lastTenPeaksForDecrease } = input;

  const result: AdaptiveMhrResult = {
    shouldPromptMemberConfirmation: false,
    proposedMhr: null,
    autoUpdated: false,
    autoUpdatedMhr: null,
    autoDecreased: false,
    autoDecreasedMhr: null,
  };

  if (sessionPeakHr > storedMhr) {
    result.shouldPromptMemberConfirmation = true;
    result.proposedMhr = sessionPeakHr;
  }

  if (lastFivePeaks && lastFivePeaks.length === 5) {
    const avgPeak5 = lastFivePeaks.reduce((a, b) => a + b, 0) / 5;
    if (avgPeak5 > storedMhr * 1.02) {
      result.autoUpdated = true;
      result.autoUpdatedMhr = Math.round(avgPeak5);
    }
  }

  if (lastTenPeaksForDecrease && lastTenPeaksForDecrease.length >= 10) {
    const allBelow = lastTenPeaksForDecrease.every((p) => p < storedMhr);
    if (allBelow) {
      const avgPeak10 = lastTenPeaksForDecrease.reduce((a, b) => a + b, 0) / lastTenPeaksForDecrease.length;
      result.autoDecreased = true;
      result.autoDecreasedMhr = Math.round(avgPeak10);
    }
  }

  return result;
}

/**
 * Mid-session sensor-glitch guardrail (spec §3.1): a new "peak" observed
 * live must be sustained for 2+ consecutive ticks before it's trusted
 * as a real peak (rejects a single-tick spike from a loose strap or BLE
 * noise). Feed it the last few raw ticks (most recent last).
 */
export function isSustainedPeak(recentBpm: number[], candidatePeak: number, minSustainedTicks = 2): boolean {
  if (recentBpm.length < minSustainedTicks) return false;
  const lastN = recentBpm.slice(-minSustainedTicks);
  // "Sustained" = every one of the last N ticks is within a tight band of
  // the candidate peak (not just one spike sitting among lower readings).
  const band = 4; // bpm tolerance
  return lastN.every((bpm) => Math.abs(bpm - candidatePeak) <= band);
}
