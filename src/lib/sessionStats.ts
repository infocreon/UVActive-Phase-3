import { computeEpoc, ZONE_NAMES, ZONE_COLOURS } from './formula-engine';
import type { MemberSessionSummary } from '../services/sessionsApi';

// zoneMinutes on the wire is a sparse map keyed "1".."5" (see the
// cloud API's SessionsService.end / Trainer App sessionsApi.ts) —
// index 0 (below Zone 1 / standby) is never persisted since it's not a
// training zone.
export function zoneMinutesArray(zoneMinutes: Record<string, number> | null | undefined): number[] {
  const arr = [0, 0, 0, 0, 0, 0];
  if (!zoneMinutes) return arr;
  for (const [k, v] of Object.entries(zoneMinutes)) {
    const idx = Number(k);
    if (idx >= 1 && idx <= 5) arr[idx] = v ?? 0;
  }
  return arr;
}

/** Time-weighted average zone (1-5), or null if no zone time was recorded at all. */
export function averageZone(zoneMinutes: Record<string, number> | null | undefined): number | null {
  const arr = zoneMinutesArray(zoneMinutes);
  const totalMinutes = arr.reduce((a, b) => a + b, 0);
  if (totalMinutes <= 0) return null;
  const weighted = arr.reduce((sum, mins, zone) => sum + mins * zone, 0);
  return weighted / totalMinutes;
}

/** Which single zone the member spent the most time in. */
export function dominantZone(zoneMinutes: Record<string, number> | null | undefined): number | null {
  const arr = zoneMinutesArray(zoneMinutes);
  let best = 0;
  let bestIdx: number | null = null;
  for (let z = 1; z <= 5; z++) {
    if (arr[z] > best) {
      best = arr[z];
      bestIdx = z;
    }
  }
  return bestIdx;
}

export interface DerivedSessionStats {
  totalZoneMinutes: number;
  zoneMinutes: number[]; // index 1-5
  avgZone: number | null;
  dominantZone: number | null;
  epocCalories: number;
  epocDurationHours: number;
}

/**
 * Everything the Session Detail screen (and Home's weekly rollups) show
 * beyond the raw avgHr/maxHr/calories/score already on the row — all
 * derived client-side via the same formula-engine the Trainer App uses,
 * from zoneMinutes + the member's own weightKg, so the numbers always
 * agree between apps.
 */
export function deriveSessionStats(session: Pick<MemberSessionSummary, 'zoneMinutes'>, weightKg: number | null | undefined): DerivedSessionStats {
  const arr = zoneMinutesArray(session.zoneMinutes);
  const totalZoneMinutes = arr.reduce((a, b) => a + b, 0);
  const { epocCalories, epocDurationHours } = computeEpoc(arr[4], arr[5], weightKg ?? 70);
  return {
    totalZoneMinutes,
    zoneMinutes: arr,
    avgZone: averageZone(session.zoneMinutes),
    dominantZone: dominantZone(session.zoneMinutes),
    epocCalories,
    epocDurationHours,
  };
}

export { ZONE_NAMES, ZONE_COLOURS };
