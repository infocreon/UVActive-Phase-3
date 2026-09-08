export interface FitnessTrajectoryInput {
  /** Average HRR over the last 4 sessions and the 4 before that. */
  avgHrrLast4: number;
  avgHrrPrev4: number;
  /** Average (zone3 + zone4 minutes) over the last 4 sessions and the 4 before that. */
  zone34MinutesLast4: number;
  zone34MinutesPrev4: number;
  /** Average start-of-session HR (resting HR proxy) over the last 4 and the 4 before that. */
  avgStartHrLast4: number;
  avgStartHrPrev4: number;
}

export type FitnessTrajectory = "improving" | "stable" | "declining";

export interface FitnessTrajectoryResult {
  fitnessScore: number;
  trajectory: FitnessTrajectory;
}

/**
 * Fitness Trajectory Score, PDF page 8. Requires a minimum of 4
 * sessions of data on both sides of the comparison (8 total) — callers
 * must gate on this before calling (returns null via the caller's own
 * "insufficient data" check, this function assumes valid non-zero
 * `prev4` denominators).
 *
 * Component weights: recovery trend 30%, zone 3-4 time trend 40%,
 * resting HR trend 30%. A small dead zone around zero avoids labelling
 * noise-level fluctuation as "improving"/"declining".
 */
export function computeFitnessTrajectory(input: FitnessTrajectoryInput): FitnessTrajectoryResult {
  const { avgHrrLast4, avgHrrPrev4, zone34MinutesLast4, zone34MinutesPrev4, avgStartHrLast4, avgStartHrPrev4 } = input;

  const recovTrend = avgHrrPrev4 !== 0 ? ((avgHrrLast4 - avgHrrPrev4) / avgHrrPrev4) * 100 : 0;
  const zone34Trend = zone34MinutesPrev4 !== 0 ? ((zone34MinutesLast4 - zone34MinutesPrev4) / zone34MinutesPrev4) * 100 : 0;
  // Resting HR trend is framed "improving = getting lower", so prev-minus-last
  // (a lower avgStartHrLast4 than avgStartHrPrev4 yields a positive trend).
  const rhTrend = avgStartHrPrev4 !== 0 ? ((avgStartHrPrev4 - avgStartHrLast4) / avgStartHrPrev4) * 100 : 0;

  const fitnessScore = recovTrend * 0.3 + zone34Trend * 0.4 + rhTrend * 0.3;

  let trajectory: FitnessTrajectory = "stable";
  if (fitnessScore > 1) trajectory = "improving";
  else if (fitnessScore < -1) trajectory = "declining";

  return { fitnessScore, trajectory };
}
