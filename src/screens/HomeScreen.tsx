import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ChevronRight, Users, Radio, CalendarClock, AlertCircle, Play } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import { useAuth } from '../hooks/useAuth';
import { gymApi, type BranchDashboard, type RemoteSession } from '../services/sessionsApi';
import { getResumableSessions, type LocalSessionRow } from '../db/database';
import { sessionEngine } from '../services/sessionEngine';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { MainTabsParamList } from '../navigation/MainTabs';
import { useResponsiveLayout } from '../lib/responsive';
import { Screen } from '../components/Screen';

type HomeNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabsParamList, 'Home'>,
  StackNavigationProp<RootStackParamList>
>;

const heroImg = require('../../assets/hero-fitness.jpg');
const sessionPhotos = [
  require('../../assets/class-hiit.jpg'),
  require('../../assets/class-boxing.jpg'),
  require('../../assets/class-cycling.jpg'),
  require('../../assets/class-yoga.jpg'),
];

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function photoFor(index: number) {
  return sessionPhotos[index % sessionPhotos.length];
}

function sessionTimeLabel(session: RemoteSession): string {
  if (!session.scheduledAt) return session.status === 'in_progress' ? 'In progress' : 'Unscheduled';
  const d = new Date(session.scheduledAt);
  return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function HomeScreen() {
  const { staff } = useAuth();
  const navigation = useNavigation<HomeNav>();
  const responsive = useResponsiveLayout();
  const wide = responsive.width >= 700;
  const heroHeight = responsive.isLandscape ? 300 : 340;

  const [dashboard, setDashboard] = useState<BranchDashboard | null>(null);
  const [dashboardError, setDashboardError] = useState(false);
  const [resumable, setResumable] = useState<LocalSessionRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [dash, resumableSessions] = await Promise.all([
      gymApi.dashboard().then((d) => { setDashboardError(false); return d; }).catch(() => { setDashboardError(true); return null; }),
      getResumableSessions(),
    ]);
    if (dash) setDashboard(dash);
    setResumable(resumableSessions);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const todaySessions = useMemo(() => (dashboard?.sessionsToday ?? []).slice(0, 5), [dashboard]);
  const activeSession = sessionEngine.isActive ? sessionEngine.getSessionMeta() : null;

  return (
    <Screen edges={['top']} style={styles.root}>
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <View style={[styles.hero, { height: heroHeight }]}>
        <Image source={heroImg} style={styles.heroImage} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', colors.background + '99', colors.background]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.heroContent}>
          <Text style={styles.eyebrow}>UVACTIVE</Text>
          <Text style={styles.headline}>
            {timeGreeting()},{'\n'}{staff?.name?.split(' ')[0] ?? 'Coach'}.
          </Text>
          <Text style={styles.heroSubtitle}>{staff?.gymName ?? 'Ready to run today\u2019s sessions.'}</Text>
          <View style={styles.heroActions}>
            {/* Routes to the Sessions tab — upcoming/scheduled sessions are
                listed there and tap-to-start, per the trainer flow. */}
            <TouchableOpacity style={styles.ctaSolid} onPress={() => navigation.navigate('Sessions')}>
              <Text style={styles.ctaSolidText}>Start a Session</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctaOutline} onPress={() => navigation.navigate('SessionSetup', { mode: 'schedule' })}>
              <Text style={styles.ctaOutlineText}>Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Floating stats card, overlapping the hero's bottom edge ── */}
      <View style={styles.statsFloatWrap}>
        <View style={styles.statsCard}>
          <StatItem icon={<CalendarClock size={18} color={colors.primary} />} value={dashboard ? String(dashboard.sessionsToday.length) : '—'} label="Today" />
          <StatItem icon={<Users size={18} color={colors.primary} />} value={dashboard ? String(dashboard.memberCount) : '—'} label="Members" />
          <StatItem icon={<Radio size={18} color={colors.primary} />} value={dashboard ? String(dashboard.sensorCount) : '—'} label="Sensors" />
        </View>
      </View>

      {dashboardError && (
        <View style={styles.errorBanner}>
          <AlertCircle size={14} color={colors.warning} />
          <Text style={styles.errorBannerText}>Couldn't refresh gym stats — showing the last known values.</Text>
        </View>
      )}

      {activeSession ? (
        <TouchableOpacity style={styles.resumeBanner} onPress={() => navigation.navigate('LiveSession', { sessionId: activeSession.sessionId })}>
          <View style={styles.livePulse}><View style={styles.livePulseDot} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.resumeTitle} numberOfLines={1}>Live · {activeSession.sessionName}</Text>
            <Text style={styles.resumeNote}>A session is running — tap to return to the live monitor.</Text>
          </View>
          <Play size={18} color={colors.primary} />
        </TouchableOpacity>
      ) : resumable.length > 0 ? (
        <TouchableOpacity
          style={styles.resumeBanner}
          onPress={() => navigation.navigate('SessionSetup', { mode: 'start-scheduled', sessionId: resumable[0].session_id, sessionName: resumable[0].session_name })}
        >
          <View style={styles.livePulse}><View style={[styles.livePulseDot, { backgroundColor: colors.warning }]} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.resumeTitle} numberOfLines={1}>Resume "{resumable[0].session_name}"</Text>
            <Text style={styles.resumeNote}>Still marked in progress on this device — reconnect sensors to continue.</Text>
          </View>
          <Play size={18} color={colors.warning} />
        </TouchableOpacity>
      ) : null}

      {/* ── Today's Sessions ─────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Sessions</Text>
          <TouchableOpacity style={styles.seeAllRow} onPress={() => navigation.navigate('Sessions')}>
            <Text style={styles.seeAllText}>See all</Text>
            <ChevronRight size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {todaySessions.length === 0 ? (
          <TouchableOpacity style={styles.emptySessions} onPress={() => navigation.navigate('SessionSetup', { mode: 'schedule' })}>
            <CalendarClock size={20} color={colors.mutedForeground} />
            <Text style={styles.emptySessionsText}>Nothing scheduled yet today — tap to schedule one.</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.sessionList, wide && styles.sessionList2]}>
            {todaySessions.map((session, i) => (
              <TouchableOpacity
                key={session.id}
                style={[styles.sessionRow, wide && styles.sessionRowWide]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('SessionDetails', { sessionId: session.id })}
              >
                <Image source={photoFor(i)} style={styles.sessionThumb} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sessionName} numberOfLines={1}>{session.name}</Text>
                  <Text style={styles.sessionMeta} numberOfLines={1}>{session.trainer?.name ?? staff?.name}</Text>
                  <Text style={styles.sessionMeta}>{sessionTimeLabel(session)}</Text>
                </View>
                <View style={styles.sessionRight}>
                  <Text style={styles.sessionSpots}>{session._count?.members ?? 0}/{session.capacity}</Text>
                  <View style={[styles.sessionActionButton, session.status === 'scheduled' && styles.sessionActionButtonScheduled]}>
                    <Text style={styles.sessionActionText}>
                      {session.status === 'in_progress' ? 'Live' : session.status === 'scheduled' ? 'View' : 'Done'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Quick-start feature card ─────────────────────────────── */}
      <View style={[styles.section, { marginBottom: spacing.xxl }]}>
        <Text style={styles.sectionTitle}>Quick Start</Text>
        <TouchableOpacity
          style={styles.featureCard}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Sessions')}
        >
          <ImageBackground source={photoFor(0)} style={styles.featureImage} imageStyle={{ borderRadius: radius.xl }}>
            <LinearGradient
              colors={['transparent', colors.background]}
              locations={[0.3, 1]}
              style={[StyleSheet.absoluteFillObject, { borderRadius: radius.xl }]}
            />
            <View style={styles.featureContent}>
              <View style={styles.featureBadge}>
                <Text style={styles.featureBadgeText}>START</Text>
              </View>
              <Text style={styles.featureTitle}>Start a Session</Text>
              <Text style={styles.featureSubtitle}>Upcoming sessions are listed in the Sessions tab — tap one to go live</Text>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </Screen>
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
  scrollContent: { paddingBottom: spacing.xl },

  hero: { position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroContent: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg },
  eyebrow: { fontFamily: fonts.headingMedium, fontSize: 12, letterSpacing: 2, color: colors.primary, marginBottom: spacing.xs, textTransform: 'uppercase' },
  headline: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, color: colors.foreground, marginBottom: spacing.xs },
  heroSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, marginBottom: spacing.md },
  heroActions: { flexDirection: 'row', gap: spacing.sm },
  ctaSolid: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  ctaSolidText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primaryForeground },
  ctaOutline: { borderWidth: 1, borderColor: colors.primary + '80', borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  ctaOutlineText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primary },

  statsFloatWrap: { paddingHorizontal: spacing.lg, marginTop: -spacing.lg, zIndex: 10 },
  statsCard: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, ...shadowCard(),
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.heading, fontSize: 17, color: colors.foreground, marginTop: 2 },
  statLabel: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.5, color: colors.mutedForeground, textTransform: 'uppercase' },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.warning + '1A', borderRadius: radius.md, padding: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  errorBannerText: { fontFamily: fonts.body, fontSize: 12, color: colors.warning, flex: 1 },

  resumeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.zone[4] + '22', borderWidth: 1, borderColor: colors.zone[4], borderRadius: radius.md,
    padding: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md,
  },
  resumeTitle: { fontFamily: fonts.bodySemiBold, color: colors.foreground, fontSize: 14 },
  resumeNote: { fontFamily: fonts.body, color: colors.mutedForeground, fontSize: 12, marginTop: 2, flex: 1 },
  livePulse: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.zone[4] + '22', alignItems: 'center', justifyContent: 'center' },
  livePulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.zone[4] },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.foreground },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },

  emptySessions: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  emptySessionsText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground },

  sessionList: { gap: spacing.sm },
  sessionList2: { flexDirection: 'row', flexWrap: 'wrap' },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm, ...shadowCard(),
  },
  sessionRowWide: { width: '49%' },
  sessionThumb: { width: 60, height: 60, borderRadius: radius.md },
  sessionName: { fontFamily: fonts.headingMedium, fontSize: 14, color: colors.foreground },
  sessionMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 1 },
  sessionRight: { alignItems: 'flex-end', gap: spacing.xs },
  sessionSpots: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primary },
  sessionActionButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  sessionActionButtonScheduled: { backgroundColor: colors.info + '33' },
  sessionActionText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.primaryForeground },

  featureCard: { borderRadius: radius.xl, overflow: 'hidden' },
  featureImage: { width: '100%', height: 190, justifyContent: 'flex-end' },
  featureContent: { padding: spacing.lg },
  featureBadge: { backgroundColor: colors.primary, alignSelf: 'flex-start', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginBottom: spacing.sm },
  featureBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.5, color: colors.primaryForeground },
  featureTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.foreground },
  featureSubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
});

function shadowCard() {
  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  } as const;
}
