import type { Sex } from "./types";

export interface KeytelInput {
  avgHr: number;
  weightKg: number;
  age: number;
  sex: Sex;
  durationHours: number;
}

/**
 * Step 1 — Gross calorie burn (Keytel formula), PDF page 6.
 * Sex-specific coefficients; result already converted from kJ/min to
 * kcal for the session duration (the /4.184 * 60 * durationHours term).
 */
export function computeGrossCalories(input: KeytelInput): number {
  const { avgHr, weightKg, age, sex, durationHours } = input;
  if (sex === "male") {
    return ((-55.0969 + 0.6309 * avgHr + 0.1988 * weightKg + 0.2017 * age) / 4.184) * 60 * durationHours;
  }
  return ((-20.4022 + 0.4472 * avgHr + 0.1263 * weightKg + 0.074 * age) / 4.184) * 60 * durationHours;
}

export interface HarrisBenedictInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}

/** Step 2 — Basal Metabolic Rate (Harris-Benedict), PDF page 6. Daily kcal at complete rest. */
export function computeBmr(input: HarrisBenedictInput): number {
  const { weightKg, heightCm, age, sex } = input;
  if (sex === "male") {
    return 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age;
  }
  return 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
}

/** Resting calories burned during the session, from BMR — PDF page 6. */
export function computeRestingCalories(bmr: number, durationHours: number): number {
  return (bmr / 24) * durationHours;
}

/** Step 3 — Net calories, PDF page 6. */
export function computeNetCalories(grossCalories: number, restingCalories: number): number {
  return grossCalories - restingCalories;
}

/**
 * Step 4 — Karvonen fitness adjustment (UV Active improvement), PDF
 * page 6-7. Only apply after the member has 5+ sessions on file — use
 * plain netCalories for sessions 1-4 (caller decides which to display
 * based on MemberProfile.sessionCount).
 */
export function computeAdjustedCalories(netCalories: number, avgHr: number, restingHr: number, mhr: number): number {
  const hrr = mhr - restingHr;
  if (hrr <= 0) return netCalories; // guard against a bad/missing MHR-restingHr pair
  const intensityFraction = (avgHr - restingHr) / hrr; // 0.0 to 1.0
  const fitnessAdjustment = 0.9 + intensityFraction * 0.2; // 0.9 to 1.1
  return netCalories * fitnessAdjustment;
}
