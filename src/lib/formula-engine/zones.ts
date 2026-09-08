import { DEFAULT_ZONE_TABLE } from "./types";
import type { Zone, ZoneBoundaryTable } from "./types";

/** %MHR = (currentBPM / MHR) * 100 — PDF page 2. */
export function computePctMhr(currentBpm: number, mhr: number): number {
  if (mhr <= 0) return 0;
  return (currentBpm / mhr) * 100;
}

/**
 * Zone boundary formula, PDF page 3:
 *   <=60% -> Zone 1, <=70% -> Zone 2, <=80% -> Zone 3, <=90% -> Zone 4, else Zone 5.
 * Below the Zone 1 floor (<50%, e.g. resting/not-yet-warmed-up) returns 0,
 * which the PDF doesn't explicitly assign a zone to — treated as
 * "no zone yet" rather than forced into Zone 1, so live displays and
 * zone-second accumulation don't credit standing-around time.
 */
export function computeZone(pctMhr: number, table: ZoneBoundaryTable = DEFAULT_ZONE_TABLE): Zone {
  const { ceilings } = table;
  if (pctMhr < 50) return 0;
  if (pctMhr <= ceilings[1]) return 1;
  if (pctMhr <= ceilings[2]) return 2;
  if (pctMhr <= ceilings[3]) return 3;
  if (pctMhr <= ceilings[4]) return 4;
  return 5;
}

export function computeZoneFromHr(currentBpm: number, mhr: number, table: ZoneBoundaryTable = DEFAULT_ZONE_TABLE): { pctMhr: number; zone: Zone } {
  const pctMhr = computePctMhr(currentBpm, mhr);
  return { pctMhr, zone: computeZone(pctMhr, table) };
}

/** Official zone names, PDF page 3 zone reference table. */
export const ZONE_NAMES: Record<Zone, string> = {
  0: "Below Zone 1",
  1: "Recovery",
  2: "Aerobic",
  3: "Fitness",
  4: "Burn",
  5: "Peak",
};

/**
 * Zone colours per the client-supplied palette (hex reference sheet).
 * "standby" is shown when a sensor is connected but not yet in any
 * zone (zone 0 / resting) — distinct from any of the 5 training zones.
 */
export const ZONE_COLOURS: Record<Zone, string> = {
  0: "#39FF14", // standby / sensor connected
  1: "#669FFF",
  2: "#4263CF",
  3: "#1E2C7C",
  4: "#FF5E73",
  5: "#FF0000",
};
