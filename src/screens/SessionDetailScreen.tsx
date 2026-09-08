import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Flame, Heart, Zap, Timer } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import { BpmLineGraph, type GraphPoint } from '../components/BpmLineGraph';
import { membersApi, type MemberFullProfile } from '../services/membersApi';
import { sessionsApi, type MemberSessionSummary } from '../services/sessionsApi';
import { ApiError } from '../services/api';
import { deriveSessionStats, ZONE_NAMES, ZONE_COLOURS } from '../lib/sessionStats';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Screen } from '../components/Screen';

export function SessionDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'SessionDetail'>>();
  const [session, setSession] = useState<MemberSessionSummary | null>(null);
  const [profile, setProfile] = useState<MemberFullProfile | null>(null);
  const [points, setPoints] = useState<GraphPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      sessionsApi.get(route.params.sessionId),
      membersApi.me(),
      sessionsApi.ticks(route.params.sessionId).catch(() => ({ ticks: [] })),
    ])
      .then(([s, p, t]) => {
        if (cancelled) return;
        setSession(s);
        setProfile(p);
        // Zone-tag each point (now returned by the cloud API) so this
        // graph matches the zone-coloured curve the Trainer App, Branch
        // Portal, and Admin Panel all show for the same session.
        setPoints(t.ticks.map((tick) => ({ value: tick.bpm, zone: tick.zone })));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this session."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [route.params.sessionId]);

  if (loading) {
    return (
      <Screen edges={['bottom']} style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (error || !session) {
    return (
      <Screen edges={['bottom']} style={styles.center}>
        <Text style={styles.emptyText}>{error || "Couldn't load this session."}</Text>
      </Screen>
    );
  }

  const derived = deriveSessionStats(session, profile?.weightKg);
  const dateLabel = session.session.startedAt
    ? new Date(session.session.startedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <Screen edges={['bottom']} style={styles.root}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.sessionName}>{session.session.name}</Text>
      <Text style={styles.sessionMeta}>
        {dateLabel}{session.session.trainer?.name ? ` · ${session.session.trainer.name}` : ''}{session.session.gym?.name ? ` · ${session.session.gym.name}` : ''}
      </Text>

      {/* BPM graph */}
      <View style={styles.graphSection}>
        <Text style={styles.sectionTitle}>Heart Rate</Text>
        <BpmLineGraph points={points} height={160} emptyLabel="No BPM data recorded for this session" />
      </View>

      {/* Core stats. Once a session has ended these are always real
          calculated values — 0 means "calculated to zero", not "not
          calculated yet" (matches Branch Portal / Admin Panel /
          Trainer App convention). "—" is reserved for Rank/Avg/Peak
          BPM, which can be genuinely absent (no sensor log at all). */}
      <View style={styles.statsGrid}>
        <StatCard icon={<Zap size={18} color={colors.primary} />} label="Rank" value={session.finalRank != null ? `#${session.finalRank}` : '—'} />
        <StatCard icon={<Zap size={18} color={colors.primary} />} label="Score" value={String(Math.round((session.score ?? 0) * 10) / 10)} />
        <StatCard icon={<Zap size={18} color={colors.primary} />} label="Sweat Points" value={String(Math.round((session.sweatPoints ?? 0) * 10) / 10)} />
        <StatCard icon={<Zap size={18} color={colors.primary} />} label="Recovery Points" value={String(Math.round((session.recoveryPoints ?? 0) * 10) / 10)} />
        <StatCard icon={<Heart size={18} color={colors.primary} />} label="Avg BPM" value={session.avgHr != null ? String(session.avgHr) : '—'} />
        <StatCard icon={<Heart size={18} color={colors.destructive} />} label="Peak BPM" value={session.maxHr != null ? String(session.maxHr) : '—'} />
        <StatCard icon={<Heart size={18} color={colors.destructive} />} label="Max %HR" value={`${Math.round(session.maxPctMhr ?? 0)}%`} />
        <StatCard icon={<Flame size={18} color={colors.warning} />} label="Calories" value={String(Math.round(session.calories ?? 0))} />
        <StatCard
          icon={<Zap size={18} color={derived.avgZone != null ? ZONE_COLOURS[Math.round(derived.avgZone) as 1 | 2 | 3 | 4 | 5] ?? colors.primary : colors.primary} />}
          label="Avg Zone"
          value={derived.avgZone != null ? ZONE_NAMES[Math.round(derived.avgZone) as 0 | 1 | 2 | 3 | 4 | 5] : '—'}
        />
        <StatCard icon={<Timer size={18} color={colors.primary} />} label="Zone Time" value={`${Math.round(derived.totalZoneMinutes)}m`} />
      </View>

      {/* EPOC — always shown separately per the formula spec, never folded into calories.
          Reads the value the Trainer App's formula engine computed once at
          session-end and synced to the cloud, rather than recomputing it
          here from zoneMinutes — that recompute could drift from what
          the Trainer App / Branch Portal / Admin Panel show for the same
          session. Falls back to the local estimate only if the cloud
          hasn't got a value yet (e.g. an older session synced before this
          field existed). */}
      <View style={styles.epocCard}>
        <View style={styles.epocHeader}>
          <Flame size={16} color={colors.zone[4]} />
          <Text style={styles.epocTitle}>Afterburn (EPOC)</Text>
        </View>
        <Text style={styles.epocValue}>+{Math.round(session.epocCalories ?? derived.epocCalories)} kcal</Text>
        <Text style={styles.epocNote}>
          Estimated extra calories burned over ~{(session.epocHours ?? derived.epocDurationHours).toFixed(1)}h post-workout as your body recovers.
          An approximation (±25%), driven by time spent above 80% of your max heart rate.
        </Text>
      </View>

      {/* Zone breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zone Breakdown</Text>
        <View style={styles.zoneBars}>
          {[1, 2, 3, 4, 5].map((z) => {
            const minutes = derived.zoneMinutes[z] ?? 0;
            const pct = derived.totalZoneMinutes > 0 ? minutes / derived.totalZoneMinutes : 0;
            return (
              <View key={z} style={styles.zoneBarRow}>
                <Text style={styles.zoneBarLabel}>{ZONE_NAMES[z as 1 | 2 | 3 | 4 | 5]}</Text>
                <View style={styles.zoneBarTrack}>
                  <View style={[styles.zoneBarFill, { width: `${Math.max(pct * 100, minutes > 0 ? 3 : 0)}%`, backgroundColor: ZONE_COLOURS[z as 1 | 2 | 3 | 4 | 5] }]} />
                </View>
                <Text style={styles.zoneBarValue}>{minutes.toFixed(1)}m</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
    </Screen>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },

  sessionName: { fontFamily: fonts.heading, fontSize: 22, color: colors.foreground },
  sessionMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 2, marginBottom: spacing.lg },

  graphSection: { marginBottom: spacing.lg },
  section: { marginTop: spacing.lg },
  sectionTitle: { fontFamily: fonts.headingMedium, fontSize: 15, color: colors.foreground, marginBottom: spacing.sm },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    width: '31%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', gap: 2,
  },
  statValue: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.foreground, marginTop: 2 },
  statLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.mutedForeground, textAlign: 'center' },

  epocCard: { backgroundColor: colors.zone[4] + '14', borderWidth: 1, borderColor: colors.zone[4] + '55', borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg },
  epocHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  epocTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.foreground },
  epocValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.zone[4] },
  epocNote: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, marginTop: spacing.xs, lineHeight: 15 },

  zoneBars: { gap: spacing.sm },
  zoneBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneBarLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, width: 64 },
  zoneBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' },
  zoneBarFill: { height: '100%', borderRadius: 4 },
  zoneBarValue: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.foreground, width: 40, textAlign: 'right' },
});
