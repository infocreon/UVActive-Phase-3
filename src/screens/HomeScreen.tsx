import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, ImageBackground, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Flame, Clock, TrendingUp, ChevronRight, Bell, CalendarClock } from 'lucide-react-native';
import { colors, fonts, radius, spacing, shadow } from '../theme/tokens';
import { useAuth } from '../hooks/useAuth';
import { membersApi, type MemberFullProfile } from '../services/membersApi';
import { sessionsApi, type MemberSessionSummary, type AvailableSession } from '../services/sessionsApi';
import { notificationsApi } from '../services/notificationsApi';
import { deriveSessionStats, ZONE_NAMES, ZONE_COLOURS } from '../lib/sessionStats';
import { getCached, setCached } from '../db/cache';
import type { MainTabsParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<MainTabsParamList, 'Home'>, StackNavigationProp<RootStackParamList>>;

// Same rotating class photos + hero image the Trainer App uses, so the
// two apps' home screens feel like one product.
const heroImg = require('../../assets/hero-fitness.jpg');
const sessionPhotos = [
  require('../../assets/class-hiit.jpg'),
  require('../../assets/class-boxing.jpg'),
  require('../../assets/class-cycling.jpg'),
  require('../../assets/class-yoga.jpg'),
];
function photoFor(index: number) {
  return sessionPhotos[index % sessionPhotos.length];
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function sessionTimeLabel(session: AvailableSession): string {
  if (!session.scheduledAt) return 'Unscheduled';
  const d = new Date(session.scheduledAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  return `${sameDay ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function HomeScreen() {
  const { member } = useAuth();
  const navigation = useNavigation<Nav>();
  // The hero image intentionally bleeds under the status bar/notch, so
  // this screen can't just wrap in <Screen edges={['top']}> like the
  // other tabs (that would push the whole hero down and lose the
  // bleed). Instead only the bell button — the one bit of tappable
  // content that sits near the top of the hero — gets pushed clear of
  // the notch/Dynamic Island using the actual device inset, rather
  // than the fixed spacing.xxl it used to fall back on (which is
  // enough clearance on an old home-button phone but not on a notch
  // or Dynamic Island device, where it sat under/behind the cutout).
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<MemberFullProfile | null>(null);
  const [sessions, setSessions] = useState<MemberSessionSummary[]>([]);
  const [bookable, setBookable] = useState<AvailableSession[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadError, setLoadError] = useState(false);
  // Only true on a genuinely cold start — no cache, nothing to paint
  // yet. Once anything (cache or a prior fetch) has populated the
  // screen, later loads happen quietly in the background instead of
  // blanking the screen back to a spinner.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hydratedRef = useRef(false);

  const cacheKey = useCallback((suffix: string) => `home:${member?.id ?? 'anon'}:${suffix}`, [member?.id]);

  // Cache-first paint: as soon as the member id is known, read
  // whatever Home last successfully showed straight out of SQLite —
  // no network round-trip — and render it immediately. This is what
  // makes the home screen "come up" instantly instead of sitting on
  // the loading spinner every time the tab regains focus, which is
  // what a network-only load (the previous behaviour here) does on
  // anything but a fast connection.
  const hydrateFromCache = useCallback(async () => {
    if (!member?.id) return;
    const [p, s, avail] = await Promise.all([
      getCached<MemberFullProfile>(cacheKey('profile')),
      getCached<MemberSessionSummary[]>(cacheKey('sessions')),
      getCached<AvailableSession[]>(cacheKey('bookable')),
    ]);
    if (p) setProfile(p.value);
    if (s) setSessions(s.value);
    if (avail) setBookable(avail.value);
    if (p || s || avail) {
      hydratedRef.current = true;
      setLoading(false);
    }
  }, [member?.id, cacheKey]);

  const load = useCallback(async () => {
    // A background refresh (cache already painted something) must
    // never flip the screen back to the full-screen spinner — that's
    // exactly the "loading for a long time" symptom on every tab
    // refocus. Only a genuinely cold load (nothing hydrated yet, no
    // pull-to-refresh in flight) shows the blocking spinner.
    if (!hydratedRef.current && !refreshing) setLoading(true);
    try {
      const [p, s, avail] = await Promise.all([
        membersApi.me(),
        sessionsApi.mine(),
        sessionsApi.available().catch(() => [] as AvailableSession[]),
      ]);
      setProfile(p);
      setSessions(s);
      setBookable(avail);
      setLoadError(false);
      hydratedRef.current = true;
      setCached(cacheKey('profile'), p);
      setCached(cacheKey('sessions'), s);
      setCached(cacheKey('bookable'), avail);
    } catch {
      // A failed background refresh with cached data already on
      // screen isn't a hard error state — the member still sees their
      // last-known data, just possibly stale. Only surface the error
      // banner when there's nothing at all to show.
      if (!hydratedRef.current) setLoadError(true);
    } finally {
      setLoading(false);
    }
    // Notification badge is best-effort — never blocks the rest of Home
    // from loading if the inbox call fails.
    notificationsApi.list(true).then((n) => setUnreadCount(n.length)).catch(() => {});
  }, [refreshing, cacheKey]);

  // On mount / member change: paint from cache instantly, then kick
  // off a real network load right behind it.
  useFocusEffect(
    useCallback(() => {
      hydrateFromCache().finally(() => { load(); });
    }, [hydrateFromCache, load]),
  );


  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const completed = useMemo(
    () => sessions.filter((s) => s.session.status === 'completed').slice().sort((a, b) => {
      const ad = a.session.endedAt ?? a.session.startedAt ?? a.enrolledAt;
      const bd = b.session.endedAt ?? b.session.startedAt ?? b.enrolledAt;
      return new Date(bd).getTime() - new Date(ad).getTime();
    }),
    [sessions],
  );

  const weekly = useMemo(() => {
    const cutoff = Date.now() - ONE_WEEK_MS;
    const thisWeek = completed.filter((s) => {
      const d = s.session.endedAt ?? s.session.startedAt;
      return d && new Date(d).getTime() >= cutoff;
    });
    let calories = 0;
    let totalZoneMinutes = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    for (const s of thisWeek) {
      calories += s.calories ?? 0;
      const derived = deriveSessionStats(s, profile?.weightKg);
      totalZoneMinutes += derived.totalZoneMinutes;
      if (s.score != null) { scoreSum += s.score; scoreCount++; }
    }
    return {
      count: thisWeek.length,
      calories: Math.round(calories),
      minutes: Math.round(totalZoneMinutes),
      avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    };
  }, [completed, profile?.weightKg]);

  const recent = completed.slice(0, 5);
  const upcomingBookable = bookable.slice(0, 4);
  const firstName = member?.name?.split(' ')[0] ?? profile?.name?.split(' ')[0] ?? 'there';

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading your data…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <Image source={heroImg} style={styles.heroImage} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', colors.background + '99', colors.background]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Notification bell — top-left, per spec: this is where a
            member sees "new session scheduled by your trainer" alerts. */}
        <TouchableOpacity
          style={[styles.bellButton, { top: Math.max(insets.top + spacing.sm, spacing.xxl) }]}
          onPress={() => navigation.navigate('Notifications')}
          hitSlop={10}
        >
          <Bell size={18} color={colors.foreground} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.heroContent}>
          <Text style={styles.eyebrow}>UVACTIVE</Text>
          <Text style={styles.headline}>{timeGreeting()},{'\n'}{firstName}.</Text>
          <Text style={styles.heroSubtitle}>{profile?.currentGym?.name ?? 'Your training hub'} · {profile?.memberCode ?? member?.memberCode}</Text>
          <TouchableOpacity style={styles.ctaSolid} onPress={() => navigation.navigate('BookSession')}>
            <Text style={styles.ctaSolidText}>Book a Session</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Floating stats card, overlapping the hero's bottom edge ── */}
      <View style={styles.statsFloatWrap}>
        <View style={styles.statsCard}>
          <StatItem icon={<Flame size={18} color={colors.primary} />} value={String(weekly.calories)} label="Calories" />
          <StatItem icon={<Clock size={18} color={colors.primary} />} value={`${weekly.minutes}m`} label="Zone Time" />
          <StatItem icon={<TrendingUp size={18} color={colors.primary} />} value={weekly.avgScore != null ? String(weekly.avgScore) : '—'} label="Avg Score" />
        </View>
        <Text style={styles.statsCaption}>{weekly.count} session{weekly.count === 1 ? '' : 's'} this week</Text>
      </View>

      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Couldn't refresh your stats — showing the last known values.</Text>
        </View>
      )}

      {/* ── Book a Session — upcoming sessions at your gym ─────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
          <TouchableOpacity style={styles.seeAllRow} onPress={() => navigation.navigate('BookSession')}>
            <Text style={styles.seeAllText}>Book</Text>
            <ChevronRight size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {upcomingBookable.length === 0 ? (
          <View style={styles.emptyCard}>
            <CalendarClock size={20} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No sessions on the schedule yet — check back once your gym adds one.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            {upcomingBookable.map((s, i) => (
              <TouchableOpacity
                key={s.id}
                style={styles.bookableCard}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('BookSession')}
              >
                <ImageBackground source={photoFor(i)} style={styles.bookableImage} imageStyle={{ borderRadius: radius.lg }}>
                  <LinearGradient
                    colors={['transparent', colors.background]}
                    locations={[0.3, 1]}
                    style={[StyleSheet.absoluteFillObject, { borderRadius: radius.lg }]}
                  />
                  <View style={styles.bookableContent}>
                    {s.isBooked ? (
                      <View style={[styles.bookableBadge, styles.bookableBadgeBooked]}>
                        <Text style={styles.bookableBadgeText}>BOOKED</Text>
                      </View>
                    ) : s.spotsOpen <= 0 ? (
                      <View style={[styles.bookableBadge, styles.bookableBadgeFull]}>
                        <Text style={styles.bookableBadgeText}>FULL</Text>
                      </View>
                    ) : null}
                    <Text style={styles.bookableTitle} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.bookableMeta} numberOfLines={1}>{sessionTimeLabel(s)}</Text>
                  </View>
                </ImageBackground>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── Recent sessions ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          <TouchableOpacity style={styles.seeAllRow} onPress={() => navigation.navigate('Workout')}>
            <Text style={styles.seeAllText}>See all</Text>
            <ChevronRight size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {recent.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No completed sessions yet — once you finish one, it'll show up here.</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {recent.map((s) => {
              const zone = deriveSessionStats(s, profile?.weightKg).dominantZone;
              const d = s.session.endedAt ?? s.session.startedAt ?? s.enrolledAt;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.sessionRow}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('SessionDetail', { sessionId: s.sessionId })}
                >
                  <View style={[styles.zoneDot, { backgroundColor: zone != null ? ZONE_COLOURS[zone as 1 | 2 | 3 | 4 | 5] : colors.muted }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.sessionName} numberOfLines={1}>{s.session.name}</Text>
                    <Text style={styles.sessionMeta}>{new Date(d).toLocaleDateString()} · {zone != null ? ZONE_NAMES[zone as 1 | 2 | 3 | 4 | 5] : 'No zone data'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.sessionStat}>{s.calories != null ? `${Math.round(s.calories)} kcal` : '—'}</Text>
                    <Text style={styles.sessionMeta}>Avg {s.avgHr ?? '—'} bpm</Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function StatItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.statItem}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, marginTop: spacing.md },
  scrollContent: { paddingBottom: spacing.xxl },

  hero: { height: 300, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroContent: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg },
  eyebrow: { fontFamily: fonts.headingMedium, fontSize: 12, letterSpacing: 2, color: colors.primary, marginBottom: spacing.xs, textTransform: 'uppercase' },
  headline: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, color: colors.foreground, marginBottom: spacing.xs },
  heroSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, marginBottom: spacing.md },
  ctaSolid: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  ctaSolidText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primaryForeground },

  bellButton: {
    // top is set dynamically per-device via useSafeAreaInsets() above —
    // this is just the pre-inset fallback.
    position: 'absolute', left: spacing.lg, top: spacing.xxl, zIndex: 10,
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background + 'AA',
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.destructive, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  bellBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: colors.primaryForeground },

  statsFloatWrap: { paddingHorizontal: spacing.lg, marginTop: -spacing.lg, zIndex: 5 },
  statsCard: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, ...shadow.card,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.heading, fontSize: 17, color: colors.foreground, marginTop: 2 },
  statLabel: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.5, color: colors.mutedForeground, textTransform: 'uppercase' },
  statsCaption: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.sm },

  errorBanner: { backgroundColor: colors.warning + '1A', borderRadius: radius.md, padding: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  errorBannerText: { fontFamily: fonts.body, fontSize: 12, color: colors.warning },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.foreground },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },

  emptyCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },

  bookableCard: { width: 220 },
  bookableImage: { width: '100%', height: 140, justifyContent: 'flex-end' },
  bookableContent: { padding: spacing.md },
  bookableBadge: { alignSelf: 'flex-start', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginBottom: spacing.xs },
  bookableBadgeBooked: { backgroundColor: colors.success },
  bookableBadgeFull: { backgroundColor: colors.muted },
  bookableBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.5, color: colors.primaryForeground },
  bookableTitle: { fontFamily: fonts.heading, fontSize: 15, color: colors.foreground },
  bookableMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, marginTop: 2 },

  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card,
  },
  zoneDot: { width: 10, height: 10, borderRadius: 5 },
  sessionName: { fontFamily: fonts.headingMedium, fontSize: 14, color: colors.foreground },
  sessionMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  sessionStat: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primary },
});
