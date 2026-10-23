import { buildChartSeries, ChartSeries } from './chart-downsample.util';
import { zoneForBpm } from '../common/hr.util';

/**
 * Cross-session HR tick sample for the trainer app's member-history curve.
 *
 * Same sampling strategy as getProfileForBranch's full-history graph: pick
 * the most recent RECENT_SESSIONS_FOR_GRAPH session-members for this
 * member at this gym, downsample each session's chartSeries (or raw log as
 * a fallback), zone-tag every point, and return them oldest→newest so a
 * multi-session curve lays out left→right.
 *
 * Kept as a standalone read from getProfileForBranch's logic so the trainer
 * app can fetch this without pulling the whole profile payload (sessions
 * metadata + aggregates), and so future sampling-tuning only has one place
 * to change.
 */
const RECENT_SESSIONS_FOR_GRAPH = 20;
const TICKS_PER_SESSION = 120;

export async function getMemberHistoryTicks(
  prisma: {
    sessionMemberFindMany: (args: {
      where: { memberId: string; session: { gymId: string } };
      include: { session: true; chartSeries: true };
      orderBy: { enrolledAt: 'desc' };
      take: number;
    }) => Promise<Array<{
      id: string;
      chartSeries: ChartSeries | null;
      session: { id: string };
    }>>;
    sensorReadingFindMany: (args: {
      where: { sessionMemberId: string };
      orderBy: { ts: 'asc' };
      take: number;
    }) => Promise<Array<{ ts: Date; hr: number }>>;
  },
  memberId: string,
  gymId: string,
  memberAgeYears: number | null,
  memberSex: string | null,
): Promise<{ ts: number; bpm: number; zone: number; pctMhr: number }[]> {
  const sessionMembers = await prisma.sessionMemberFindMany({
    where: { memberId, session: { gymId } },
    include: { session: true, chartSeries: true },
    orderBy: { enrolledAt: 'desc' },
    take: RECENT_SESSIONS_FOR_GRAPH,
  });

  const hrRowsPerSession = await Promise.all(
    sessionMembers.map(async (sm: { id: string; chartSeries: ChartSeries | null }) => {
      const series = sm.chartSeries;
      if (series && Array.isArray(series.t) && Array.isArray(series.hr) && series.t.length > 0) {
        const step = Math.max(1, Math.ceil(series.t.length / TICKS_PER_SESSION));
        const rows: { ts: number; hr: number }[] = [];
        for (let i = 0; i < series.t.length; i += step) {
          rows.push({ ts: series.t[i], hr: series.hr[i] });
        }
        return rows;
      }
      const raw = await prisma.sensorReadingFindMany({
        where: { sessionMemberId: sm.id },
        orderBy: { ts: 'asc' },
        take: TICKS_PER_SESSION,
      });
      return raw.map((r: { ts: Date; hr: number }) => ({ ts: r.ts.getTime(), hr: r.hr }));
    }),
  );

  const hrRows = hrRowsPerSession.flat().sort((a: { ts: number; hr: number }, b: { ts: number; hr: number }) => a.ts - b.ts);
  return hrRows.map((r: { ts: number; hr: number }) => {
    const { zone, pctMhr } = zoneForBpm(r.hr, memberAgeYears, memberSex);
    return { ts: r.ts, bpm: r.hr, zone, pctMhr: Math.round(pctMhr * 10) / 10 };
  });
}
