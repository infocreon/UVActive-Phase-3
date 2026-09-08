import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Trophy, Home, ChevronRight, HeartPulse } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { getSession, getSessionMembers, getTicksForMember, type LocalSessionRow } from '../db/database';
import { ZoneDistributionBar, ZoneTimeBreakdown, zoneSecondsToBuckets } from '../components/ZoneDistribution';
import { ZONE_COLOURS, ZONE_NAMES, computeMhr, computeZoneFromHr } from '../lib/formula-engine';
import { BpmLineGraph, type GraphPoint } from '../components/BpmLineGraph';
import { sessionsApi, membersApi, type HrTick } from '../services/sessionsApi';
import { Screen } from '../components/Screen';
import { ConnectionStatus } from '../components/ConnectionStatus';

interface SummaryRow {
  member_id: string;
  member_name: string;
  avg_hr: number | null;
  peak_hr: number | null;
  calories: number | null;
  uv_score: number | null;
  zone_seconds_json?: string | null;
  // Full FinalSessionSummary JSON blob (sweatPoints/recoveryPoints/epoc/
  // maxPctMhr/etc.) — saveSessionMemberSummary() writes this alongside
  // the flat columns above but the flat columns never carried these
  // fields themselves, so without reading this blob the rich stats
  // computed by the formula engine never reached this screen even
  // though the Admin Panel / Branch Portal / Member App all read and
  // display them from the exact same cloud-synced fields.
  summary_json?: string | null;
}

interface RichStats {
  sweatPoints: number | null;
  recoveryPoints: number | null;
  recoveryGrade: string | null;
  epocCalories: number | null;
  avgPctMhr: number | null;
  maxPctMhr: number | null;
}

const EMPTY_RICH_STATS: RichStats = {
  sweatPoints: null, recoveryPoints: null, recoveryGrade: null,
  epocCalories: null, avgPctMhr: null, maxPctMhr: null,
};

/** Pulls the rich post-workout fields (spec §7) out of a row's summary_json
 *  blob — same fields the Admin Panel / Branch Portal / Member App show,
 *  just sourced locally here instead of from the cloud API response. */
function parseRichStats(json: string | null | undefined): RichStats {
  if (!json) return EMPTY_RICH_STATS;
  try {
    const parsed = JSON.parse(json);
    return {
      sweatPoints: typeof parsed?.sweatPoints === 'number' ? parsed.sweatPoints : null,
      recoveryPoints: typeof parsed?.recoveryPoints === 'number' ? parsed.recoveryPoints : null,
      recoveryGrade: typeof parsed?.recoveryGrade === 'string' ? parsed.recoveryGrade : null,
      epocCalories: typeof parsed?.epocCalories === 'number' ? parsed.epocCalories : null,
      avgPctMhr: typeof parsed?.avgPctMhr === 'number' ? parsed.avgPctMhr : null,
      maxPctMhr: typeof parsed?.maxPctMhr === 'number' ? parsed.maxPctMhr : null,
    };
  } catch {
    return EMPTY_RICH_STATS;
  }
}

function parseZoneSeconds(json: string | null | undefined): number[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function topZone(zoneSeconds: number[] | null): number {
  if (!zoneSeconds) return 0;
  let best = 0, bestSecs = -1;
  for (let z = 0; z < zoneSeconds.length; z++) {
    if (zoneSeconds[z] > bestSecs) { bestSecs = zoneSeconds[z]; best = z; }
  }
  return best;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function SessionSummaryScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'SessionSummary'>>();
  const { width } = useWindowDimensions();

  const [session, setSession] = useState<LocalSessionRow | null>(null);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  // BPM graph for the winner — loaded after the summary rows arrive so
  // we know who the top-ranked member is.
  const [graphTicks, setGraphTicks] = useState<HrTick[]>([]);
  const [graphAge, setGraphAge] = useState<number | null>(null);
  const [graphSex, setGraphSex] = useState<'male' | 'female' | 'other' | null>(null);
  const [graphMemberId, setGraphMemberId] = useState<string | null>(null);
  const sessionId = route.params.sessionId;

  useEffect(() => {
    Promise.all([getSession(sessionId), getSessionMembers(sessionId)])
      .then(([s, m]) => {
        setSession(s);
        setRows((m as unknown as SummaryRow[]).slice().sort((a, b) => (b.uv_score ?? -1) - (a.uv_score ?? -1)));
      })
      .catch((e) => console.warn('[SessionSummaryScreen] Failed to load session', e))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Load the top member's BPM ticks for the session graph after rows arrive.
  useEffect(() => {
    if (!rows.length) return;
    const targetId = graphMemberId ?? rows[0].member_id;
    let cancelled = false;
    (async () => {
      // Cloud-first: this graph must match what the Branch Portal, Admin
      // Panel, and Member App all show for this session — all three read
      // from the cloud API, never phone-local SQLite. Local ticks are
      // only a fallback for offline viewing right after ending a session,
      // before this device's own sync has gone through yet.
      let ticks: HrTick[] = [];
      const remote = await sessionsApi.athleteTicks(sessionId, targetId).catch(() => null);
      if (remote?.ticks?.length) {
        ticks = remote.ticks;
      } else {
        const localTicks = await getTicksForMember(sessionId, targetId).catch(() => [] as { ts: number; bpm: number }[]);
        ticks = localTicks.map((t) => ({ ts: t.ts, bpm: t.bpm }));
      }
      if (!cancelled) setGraphTicks(ticks);
      const p = await membersApi.profile(targetId).catch(() => null);
      if (!cancelled && p) {
        setGraphAge(p.member?.ageYears ?? null);
        setGraphSex((p.member?.sex as 'male' | 'female' | 'other' | null) ?? null);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, rows, graphMemberId]);

  const graphMhr = graphAge != null && graphSex && graphSex !== 'other' ? computeMhr(graphAge, graphSex) : null;
  const graphPoints: GraphPoint[] = useMemo(() => {
    if (graphMhr && graphMhr > 0) {
      return graphTicks.map((t) => {
        const { zone } = computeZoneFromHr(t.bpm, graphMhr);
        return { value: t.bpm, zone, ts: t.ts };
      });
    }
    return graphTicks.map((t) => ({ value: t.bpm, ts: t.ts }));
  }, [graphTicks, graphMhr]);
  const graphMemberName = useMemo(() => {
    if (!graphMemberId) return rows[0]?.member_name ?? '';
    return rows.find((r) => r.member_id === graphMemberId)?.member_name ?? '';
  }, [graphMemberId, rows]);

  // Whole-session aggregate zone distribution — sum of every member's
  // zone-seconds for the class-level bar shown above the leaderboard.
  //
  // NOTE: this hook — and the rich-stats aggregate hook below it — used
  // to live AFTER the `if (loading) return ...` early-return further
  // down this component. That's a Rules-of-Hooks violation: the very
  // first render (while `loading` is still true) bails out before ever
  // reaching these useMemo calls, so React records a shorter hook list
  // for that render. The instant `loading` flips to false, render
  // continues past the old early-return point and calls these hooks
  // for the first time — a DIFFERENT number of hooks than the previous
  // render used. React can't reconcile that and throws "Rendered more
  // hooks than during the previous render", which is exactly the crash
  // on this screen. Every hook must run unconditionally, on every
  // render, in the same order — so both live up here, before any
  // conditional return.
  const aggZoneBuckets = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0];
    let any = false;
    for (const r of rows) {
      const zs = parseZoneSeconds(r.zone_seconds_json);
      if (zs) {
        for (let z = 0; z < Math.min(zs.length, 6); z++) {
          totals[z] += zs[z];
          if (zs[z] > 0) any = true;
        }
      }
    }
    return any ? zoneSecondsToBuckets(totals) : null;
  }, [rows]);

  // Session-wide rollup of the rich post-workout fields (spec §7) —
  // same figures the Admin Panel / Branch Portal / Member App show for
  // this session, aggregated here from each member's summary_json.
  const aggRichStats = useMemo(() => {
    let sweatTotal = 0;
    let recoveryTotal = 0;
    let recoveryCount = 0;
    let epocTotal = 0;
    let maxPctMhr: number | null = null;
    for (const r of rows) {
      const rs = parseRichStats(r.summary_json);
      if (rs.sweatPoints != null) sweatTotal += rs.sweatPoints;
      if (rs.recoveryPoints != null) { recoveryTotal += rs.recoveryPoints; recoveryCount++; }
      if (rs.epocCalories != null) epocTotal += rs.epocCalories;
      if (rs.maxPctMhr != null) maxPctMhr = maxPctMhr == null ? rs.maxPctMhr : Math.max(maxPctMhr, rs.maxPctMhr);
    }
    return {
      sweatTotal: Math.round(sweatTotal * 10) / 10,
      recoveryTotal: recoveryCount > 0 ? Math.round(recoveryTotal * 10) / 10 : null,
      epocTotal: Math.round(epocTotal),
      maxPctMhr,
    };
  }, [rows]);

  if (loading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  const totalScore = rows.reduce((sum, r) => sum + (r.uv_score ?? 0), 0);
  const avgPct = rows.length
    ? Math.round(rows.reduce((sum, r) => sum + (r.avg_hr ?? 0), 0) / rows.length)
    : 0;
  const totalCalories = rows.reduce((sum, r) => sum + (r.calories ?? 0), 0);
  const podium = rows.slice(0, 3);
  const twoCol = width >= 900;

  return (
    <Screen edges={['top', 'bottom']}>
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {/* Session header */}
        <View style={styles.header}>
          <View style={styles.trophyWrap}>
            <Trophy size={26} color={colors.primary} />
          </View>
          <Text style={styles.title}>{session?.session_name ?? 'Session'}</Text>
          <Text style={styles.subtitle}>
            {formatDuration(session?.duration_seconds ?? null)}
            {session?.ended_at ? ` · Ended ${new Date(session.ended_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
            {' '}· {rows.length} athletes
          </Text>
          {/* Results are calculated and saved locally the instant the
              trainer confirms End Session — this pill is the only signal
              that the same results have actually made it to the cloud
              yet, which is what the Branch Portal / Admin Panel / Member
              App all read from. Goes "Syncing…" → "Synced" on its own,
              same live state as the Live Session screen's pill. */}
          <View style={styles.syncPillWrap}>
            <ConnectionStatus />
          </View>
        </View>

        {/* Top-line stats */}
        <View style={styles.topStats}>
          <TopStat value={totalScore.toLocaleString()} label="Total UV Points" color={colors.primary} />
          <TopStat value={String(avgPct)} label="Avg HR (bpm)" color={colors.warning} />
          <TopStat value={totalCalories.toLocaleString()} label="Total Calories" color={colors.success} />
          <TopStat value={String(rows.length)} label="Athletes" color={colors.foreground} />
        </View>

        {/* Rich post-workout rollup — same fields the Admin Panel / Branch
            Portal / Member App show for this session, so a trainer sees
            an identical picture the moment the session ends, not just
            after cloud sync catches up. */}
        <View style={[styles.topStats, { borderTopWidth: 0 }]}>
          <TopStat value={String(aggRichStats.sweatTotal)} label="Sweat Points" color={colors.primary} />
          <TopStat value={aggRichStats.recoveryTotal != null ? String(aggRichStats.recoveryTotal) : '0'} label="Recovery Points" color={colors.success} />
          <TopStat value={`${aggRichStats.epocTotal}`} label="EPOC (kcal)" color={colors.warning} />
          <TopStat value={aggRichStats.maxPctMhr != null ? `${Math.round(aggRichStats.maxPctMhr)}%` : '0%'} label="Max %HR" color={colors.foreground} />
        </View>

        {/* Podium */}
        {podium.length >= 2 && (
          <View style={styles.podiumRow}>
            {podium.length === 3 ? (
              <>
                <PodiumBlock item={podium[1]} rank={2} medal="2" color="#6B7280" />
                <PodiumBlock item={podium[0]} rank={1} medal="1" color="#D97706" big />
                <PodiumBlock item={podium[2]} rank={3} medal="3" color="#92400E" />
              </>
            ) : (
              <>
                <PodiumBlock item={podium[0]} rank={1} medal="1" color="#D97706" big />
                {podium[1] && <PodiumBlock item={podium[1]} rank={2} medal="2" color="#6B7280" />}
              </>
            )}
          </View>
        )}

        {/* Whole-session zone distribution — aggregate of every member */}
        {aggZoneBuckets && (
          <View style={styles.zoneBlock}>
            <Text style={styles.zoneBlockTitle}>Zone Distribution — whole class, this session</Text>
            <ZoneDistributionBar buckets={aggZoneBuckets} height={14} />
            <ZoneTimeBreakdown buckets={aggZoneBuckets} />
          </View>
        )}

        {/* Session BPM curve — per-athlete heart-rate graph for this session */}
        <View style={styles.zoneBlock}>
          <View style={styles.graphHeaderRow}>
            <Text style={styles.zoneBlockTitle}>Heart Rate Curve — {graphMemberName}</Text>
            {rows.length > 1 && (
              <TouchableOpacity
                style={styles.graphMemberPill}
                onPress={() => {
                  const currentIdx = rows.findIndex((r) => r.member_id === (graphMemberId ?? rows[0].member_id));
                  const nextIdx = (currentIdx + 1) % rows.length;
                  setGraphMemberId(rows[nextIdx].member_id);
                }}
                activeOpacity={0.8}
              >
                <HeartPulse size={12} color={colors.primary} />
                <Text style={styles.graphMemberPillText}>Switch member</Text>
              </TouchableOpacity>
            )}
          </View>
          <BpmLineGraph
            points={graphPoints}
            height={140}
            scrollable
            pxPerPoint={4}
            emptyLabel="No second-by-second BPM data available for this session."
          />
        </View>

        {/* Leaderboard section title */}
        {rows.length > 0 && (
          <View style={[styles.zoneLegendRow, twoCol && styles.zoneLegendRow2]}>
            <Text style={styles.zoneLegendTitle}>Final Leaderboard — tap a member for their session stats</Text>
          </View>
        )}

        {/* Leaderboard rows */}
        {rows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No results recorded for this session.</Text>
          </View>
        ) : (
          rows.map((item, index) => {
            const zs = parseZoneSeconds(item.zone_seconds_json);
            const tz = topZone(zs);
            const zoneColor = tz === 0 ? colors.muted : ZONE_COLOURS[tz as keyof typeof ZONE_COLOURS] ?? colors.muted;
            const rich = parseRichStats(item.summary_json);
            return (
              <TouchableOpacity
                key={item.member_id}
                style={[styles.row, index === 0 && styles.rowTop1, index === 1 && styles.rowTop2, index === 2 && styles.rowTop3]}
                onPress={() => navigation.navigate('SessionAthleteDetail', { memberId: item.member_id, sessionId: route.params.sessionId })}
                activeOpacity={0.85}
              >
                <View style={[styles.rankBadge, index === 0 && styles.rankGold, index === 1 && styles.rankSilver, index === 2 && styles.rankBronze]}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={[styles.zoneBar, { backgroundColor: zoneColor }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.member_name}</Text>
                  <Text style={styles.stats} numberOfLines={1}>
                    Avg {item.avg_hr ?? '—'} · Peak {item.peak_hr ?? '—'} bpm · {item.calories ?? '—'} kcal
                    {tz > 0 ? ` · ${ZONE_NAMES[tz as keyof typeof ZONE_NAMES]}` : ''}
                  </Text>
                  {/* Same rich fields (Sweat/Recovery/EPOC/Max %HR) shown on
                      the Admin Panel / Branch Portal / Member App detail
                      views for this same member+session — kept on one
                      line here since the full-precision breakdown is a
                      tap away on SessionAthleteDetail. */}
                  <Text style={styles.stats} numberOfLines={1}>
                    Sweat {rich.sweatPoints != null ? Math.round(rich.sweatPoints * 10) / 10 : '—'} · Recovery {rich.recoveryPoints != null ? Math.round(rich.recoveryPoints * 10) / 10 : '0'} · EPOC {rich.epocCalories != null ? `${Math.round(rich.epocCalories)} kcal` : '—'} · Max {rich.maxPctMhr != null ? `${Math.round(rich.maxPctMhr)}%HR` : '0%HR'}
                  </Text>
                  {zs && <ZoneDistributionBar buckets={zoneSecondsToBuckets(zs)} height={5} />}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.score}>{item.uv_score ?? '—'}</Text>
                  <Text style={styles.scoreLabel}>score</Text>
                </View>
                <ChevronRight size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            );
          })
        )}

        {/* Back to Home */}
        <TouchableOpacity style={styles.doneButton} onPress={() => navigation.navigate('Main')}>
          <Home size={18} color={colors.primaryForeground} />
          <Text style={styles.doneButtonText}>Back to Home</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
    </Screen>
  );
}

function TopStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.topStat}>
      <Text style={[styles.topStatValue, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.topStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function PodiumBlock({ item, rank, medal, color, big = false }: { item: SummaryRow; rank: number; medal: string; color: string; big?: boolean }) {
  const initials = item.member_name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <View style={[styles.podiumBlock, big && styles.podiumBlockBig]}>
      <Text style={styles.podiumMedal}>{medal === '1' ? '🥇' : medal === '2' ? '🥈' : '🥉'}</Text>
      <Text style={styles.podiumRank}>#{rank}</Text>
      <View style={[styles.podiumAvatar, { backgroundColor: color, width: big ? 52 : 42, height: big ? 52 : 42, borderRadius: big ? 26 : 21 }]}>
        <Text style={styles.podiumAvatarText}>{initials}</Text>
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>{item.member_name}</Text>
      <Text style={styles.podiumScore}>{item.uv_score ?? '—'} pts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.lg, gap: 3 },
  syncPillWrap: { marginTop: spacing.sm },
  trophyWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.foreground, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },
  topStats: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, marginTop: spacing.lg, paddingVertical: spacing.sm },
  topStat: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  topStatValue: { fontFamily: fonts.heading, fontSize: 17, color: colors.primary },
  topStatLabel: { fontFamily: fonts.body, fontSize: 9, color: colors.mutedForeground, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  podiumBlock: { flex: 1, maxWidth: 130, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  podiumBlockBig: { borderColor: '#D97706' },
  podiumMedal: { fontSize: 18, marginBottom: 2 },
  podiumRank: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.mutedForeground, marginBottom: 4 },
  podiumAvatar: { alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  podiumAvatarText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: '#fff' },
  podiumName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.foreground, textAlign: 'center' },
  podiumScore: { fontFamily: fonts.heading, fontSize: 13, color: colors.primary, marginTop: 3 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  zoneLegendRow: { marginBottom: spacing.sm },
  zoneLegendRow2: {},
  zoneLegendTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.mutedForeground },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm,
  },
  rowTop1: { borderColor: '#D97706' },
  rowTop2: { borderColor: '#6B7280' },
  rowTop3: { borderColor: '#92400E' },
  rankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  rankGold: { backgroundColor: '#D97706' },
  rankSilver: { backgroundColor: '#6B7280' },
  rankBronze: { backgroundColor: '#92400E' },
  rankText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: '#fff' },
  zoneBar: { width: 4, height: 34, borderRadius: 2 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.foreground },
  stats: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  score: { fontFamily: fonts.heading, fontSize: 17, color: colors.primary },
  scoreLabel: { fontFamily: fonts.body, fontSize: 9, color: colors.mutedForeground, textTransform: 'uppercase' },
  emptyWrap: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },
  zoneBlock: { marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.xs, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  zoneBlockTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.mutedForeground, marginBottom: spacing.sm },
  graphHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  graphMemberPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '18', borderWidth: 1, borderColor: colors.primary + '44', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  graphMemberPillText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: colors.primary },
  doneButton: {
    flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.xl,
  },
  doneButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.primaryForeground },
});