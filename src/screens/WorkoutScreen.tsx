import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import { sessionsApi, type MemberSessionSummary } from '../services/sessionsApi';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Screen } from '../components/Screen';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DayStatus = 'completed' | 'active' | 'scheduled';
const STATUS_COLOURS: Record<DayStatus, string> = {
  completed: colors.destructive,
  active: colors.success,
  scheduled: colors.warning,
};
const STATUS_LABELS: Record<DayStatus, string> = {
  completed: 'Completed',
  active: 'Active',
  scheduled: 'Scheduled',
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sessionDate(s: MemberSessionSummary): Date | null {
  const raw = s.session.startedAt ?? s.session.scheduledAt ?? s.enrolledAt;
  return raw ? new Date(raw) : null;
}

function statusFor(s: MemberSessionSummary): DayStatus {
  if (s.session.status === 'completed') return 'completed';
  if (s.session.status === 'in_progress') return 'active';
  return 'scheduled';
}

// Priority when a day has more than one session status — most
// "finished" / notable wins the dot colour, matching the legend order
// in the reference design (Completed > Active > Scheduled).
const STATUS_PRIORITY: DayStatus[] = ['completed', 'active', 'scheduled'];

export function WorkoutScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [sessions, setSessions] = useState<MemberSessionSummary[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await sessionsApi.mine());
    } catch {
      // Calendar just shows empty for the month; not worth a blocking error screen.
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byDate = useMemo(() => {
    const map = new Map<string, MemberSessionSummary[]>();
    for (const s of sessions) {
      const d = sessionDate(s);
      if (!d) continue;
      const key = dateKey(d);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [sessions]);

  const todayKey = dateKey(new Date());

  const grid = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstWeekday = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  const selectedSessions = selectedKey ? (byDate.get(selectedKey) ?? []) : [];

  return (
    <Screen edges={['top']} style={styles.root}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading}>Workout</Text>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={styles.navButton} hitSlop={10}>
          <ChevronLeft size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <TouchableOpacity onPress={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={styles.navButton} hitSlop={10}>
          <ChevronRight size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={styles.weekdayLabel}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((d, i) => {
          if (!d) return <View key={i} style={styles.cell} />;
          const key = dateKey(d);
          const daySessions = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const status = STATUS_PRIORITY.find((st) => daySessions.some((s) => statusFor(s) === st));

          return (
            <TouchableOpacity
              key={i}
              style={styles.cell}
              onPress={() => setSelectedKey((prev) => (prev === key ? null : key))}
              activeOpacity={0.7}
            >
              <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected, isToday && !isSelected && styles.dayCircleToday]}>
                <Text style={[styles.dayText, (isSelected || isToday) && styles.dayTextActive]}>{d.getDate()}</Text>
              </View>
              {status && <View style={[styles.dot, { backgroundColor: STATUS_COLOURS[status] }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.legend}>
        {(['completed', 'active', 'scheduled'] as DayStatus[]).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_COLOURS[s] }]} />
            <Text style={styles.legendLabel}>{STATUS_LABELS[s]}</Text>
          </View>
        ))}
      </View>

      {selectedKey && (
        <View style={styles.daySection}>
          <Text style={styles.daySectionTitle}>
            {new Date(selectedKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          {selectedSessions.length === 0 ? (
            <Text style={styles.emptyText}>Nothing on this day.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {selectedSessions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.sessionRow}
                  activeOpacity={0.85}
                  onPress={() => s.session.status === 'completed' && navigation.navigate('SessionDetail', { sessionId: s.sessionId })}
                >
                  <View style={[styles.zoneDot, { backgroundColor: STATUS_COLOURS[statusFor(s)] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionName}>{s.session.name}</Text>
                    <Text style={styles.sessionMeta}>
                      {s.session.trainer?.name ?? s.session.gym?.name ?? ''} · {STATUS_LABELS[statusFor(s)]}
                    </Text>
                  </View>
                  {s.session.status === 'completed' && (
                    <Text style={styles.sessionStat}>{s.calories != null ? `${Math.round(s.calories)} kcal` : '—'}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
    </Screen>
  );
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  heading: { fontFamily: fonts.heading, fontSize: 24, color: colors.foreground, marginBottom: spacing.lg },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  navButton: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: fonts.heading, fontSize: 17, color: colors.foreground },

  weekdayRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.mutedForeground },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: CELL_SIZE + 12, alignItems: 'center', justifyContent: 'flex-start', paddingTop: spacing.xs },
  dayCircle: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: CELL_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: { backgroundColor: colors.primary },
  dayCircleToday: { borderWidth: 1.5, borderColor: colors.primary },
  dayText: { fontFamily: fonts.body, fontSize: 14, color: colors.foreground },
  dayTextActive: { fontFamily: fonts.bodySemiBold, color: colors.primaryForeground },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3 },

  legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground },

  daySection: { marginTop: spacing.lg },
  daySectionTitle: { fontFamily: fonts.headingMedium, fontSize: 15, color: colors.foreground, marginBottom: spacing.sm },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },

  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  zoneDot: { width: 10, height: 10, borderRadius: 5 },
  sessionName: { fontFamily: fonts.headingMedium, fontSize: 14, color: colors.foreground },
  sessionMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  sessionStat: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primary },
});
