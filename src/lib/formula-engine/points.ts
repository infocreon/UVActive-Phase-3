import { DEFAULT_ZONE_TABLE } from "./types";
import type { Zone, ZoneBoundaryTable } from "./types";

/**
 * Standard Sweat Points (whole-minute, flat per-zone weight) — PDF page 3.
 * zoneMinutes index 1-5 (index 0 ignored).
 */
export function computeStandardSweatPoints(zoneMinutes: [number, number, number, number, number, number]): number {
  return zoneMinutes[1] * 1 + zoneMinutes[2] * 2 + zoneMinutes[3] * 3 + zoneMinutes[4] * 4 + zoneMinutes[5] * 5;
}

/**
 * UV Active improvement — intensity-weighted Sweat Points, run once per
 * second of real-time tracking (PDF page 3-4). Call this every tick and
 * add the return value to the running sessionSweatPoints total; do NOT
 * recompute from zoneMinutes at the end, since depth-within-zone is
 * only knowable tick by tick.
 *
 * Returns 0 for zone 0 (below Zone 1 floor) — no points for standing
 * around under the training threshold.
 */
export function computeSweatPointsTick(pctMhr: number, zone: Zone, table: ZoneBoundaryTable = DEFAULT_ZONE_TABLE): number {
  if (zone === 0) return 0;
  const zoneMultiplier = zone; // 1-5
  const zoneCeiling = table.ceilings[zone as 1 | 2 | 3 | 4 | 5];
  // intensityFactor per the PDF is pctMHR / zoneCeiling. For zone 5 this
  // can exceed 1.0 when pctMHR > 100 — intentional, a 110% MHR reading
  // earns more than a 91% one, both still Zone 5.
  const intensityFactor = pctMhr / zoneCeiling;
  const secondPoints = (zoneMultiplier * intensityFactor) / 60;
  return secondPoints;
}

/** UV Score = Sweat Points + Recovery Points — PDF page 5. Pass 0 for recoveryPoints if no recovery challenge was run. */
export function computeUvScore(sweatPoints: number, recoveryPoints: number): number {
  return sweatPoints + recoveryPoints;
}

/**
 * Consistency Score (UV Active exclusive) — PDF page 5-6. For one
 * trainer-defined interval with a target zone.
 */
export function computeIntervalConsistency(secondsInTargetZone: number, intervalTotalSeconds: number): number {
  if (intervalTotalSeconds <= 0) return 0;
  return (secondsInTargetZone / intervalTotalSeconds) * 100;
}

/** Session consistency score = mean of all interval consistencies. Returns null if no intervals had a target zone set (nothing to score). */
export function computeSessionConsistency(intervalConsistencies: number[]): number | null {
  if (intervalConsistencies.length === 0) return null;
  const sum = intervalConsistencies.reduce((a, b) => a + b, 0);
  return sum / intervalConsistencies.length;
}
