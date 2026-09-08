import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, useWindowDimensions, Modal, TouchableOpacity, Alert, BackHandler, ActivityIndicator, TextInput } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { X, Plus, Radio, UserX, Search } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { sessionEngine } from '../services/sessionEngine';
import type { LiveTick } from '../lib/formula-engine';
import { AthleteTile } from '../components/AthleteTile';
import { BpmLineGraph, type GraphPoint } from '../components/BpmLineGraph';
import { SessionControlBar } from '../components/SessionControlBar';
import { CountdownOverlay } from '../components/CountdownOverlay';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { getTicksForMember, getSessionMembers } from '../db/database';
import { ZoneDistributionBar, ZoneTimeBreakdown, zoneSecondsToBuckets } from '../components/ZoneDistribution';
import { Screen } from '../components/Screen';
import { membersApi, type RemoteMember } from '../services/sessionsApi';
import { startNearbyScan, registerNearbyDevice, type NearbyBLEDevice } from '../services/ble';
import { assignSensorToMember, addRegisteredSensor } from '../services/sensorRegistry';

const TILE_GAP = 8;
const MIN_TILE_WIDTH = 100;

type TileData = LiveTick & { needsSensor?: boolean };

export function LiveSessionScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'LiveSession'>>();
  const { width } = useWindowDimensions();

  const [showCountdown, setShowCountdown] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [breakActive, setBreakActive] = useState(false);
  const [ticks, setTicks] = useState<Map<string, LiveTick>>(new Map());
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [assignMemberId, setAssignMemberId] = useState<string | null>(null); // dead-block tap → assign/absent sheet
  const [showLateJoin, setShowLateJoin] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // End-session overlay state — shows a calculating animation while
  // sessionEngine.endSession() finalizes every member's results.
  const [ending, setEnding] = useState(false);
  const [endProgress, setEndProgress] = useState({ current: 0, total: 0, memberName: '' });

  useEffect(() => {
    const unsub = sessionEngine.addLiveListener(setTicks);
    return unsub;
  }, []);

  // Roster composition (who's in the session + who has a sensor) changes
  // independently of the tick stream — assign/late-join/mark-absent all
  // fire this listener so the grid re-renders immediately.
  const [rosterVersion, setRosterVersion] = useState(0);
  useEffect(() => sessionEngine.addRosterListener(() => setRosterVersion((v) => v + 1)), []);
  const roster = useMemo(() => sessionEngine.getMemberRoster(), [rosterVersion]);

  const confirmEnd = useCallback(() => {
    Alert.alert('End Session', 'This finalizes results for everyone and posts the leaderboard.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          try {
            setEnding(true);
            await sessionEngine.endSession((current, total, memberName) => {
              setEndProgress({ current, total, memberName });
            });
            navigation.replace('SessionSummary', { sessionId: route.params.sessionId });
          } catch (e) {
            setEnding(false);
            Alert.alert('Could not end session', e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);
  }, [navigation, route.params.sessionId]);

  // A hardware back-button mid-session would otherwise strand the
  // session in a weird nav state — force it through the same "end or
  // stay" prompt as the End button, never a silent back-out.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmEnd();
      return true;
    });
    return () => sub.remove();
  }, [confirmEnd]);

  // Elapsed timer — paused when the session is paused so the clock matches
  // actual training time, not wall-clock time.
  useEffect(() => {
    if (showCountdown || isPaused || breakActive) return;
    const t = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [showCountdown, isPaused, breakActive]);

  const columns = Math.max(2, Math.floor(width / (MIN_TILE_WIDTH + TILE_GAP)));
  const tileWidth = (width - spacing.lg * 2 - TILE_GAP * (columns - 1)) / columns;

  // Live tiles ranked by score; members without a tick yet render as
  // waiting placeholders (or, if they have no sensor at all, as tappable
  // "dead blocks") at the end so the trainer sees the full roster.
  const displayList = useMemo(() => {
    const live = [...ticks.values()].sort((a, b) => b.sweatPointsSoFar - a.sweatPointsSoFar);
    const waiting = roster.filter((m) => !ticks.has(m.memberId));
    const waitingTiles: TileData[] = waiting.map((m) => ({
      memberId: m.memberId,
      memberName: m.memberName,
      currentBPM: 0,
      pctMHR: 0,
      currentZone: 0,
      zoneColour: colors.muted,
      sweatPointsSoFar: 0,
      timeInCurrentZone: 0,
      isPersonalBest: false,
      isDropped: true,
      rank: 0,
      needsSensor: !m.sensorDeviceId,
    }));
    return { live, waitingTiles };
  }, [ticks, roster]);

  const onCountdownDone = useCallback(() => {
    sessionEngine.resume();
    setShowCountdown(false);
  }, []);

  const onCountdownCancel = useCallback(() => {
    sessionEngine.cancelSession('Cancelled before start').catch(() => {});
    navigation.goBack();
  }, [navigation]);

  const onPauseResume = () => {
    if (isPaused) { sessionEngine.resume(); setIsPaused(false); } else { sessionEngine.pause(); setIsPaused(true); }
  };
  const onBreak = () => { sessionEngine.pause(); setBreakActive(true); };
  const onBreakEnd = () => { sessionEngine.resume(); setBreakActive(false); };

  const onTilePress = (memberId: string) => {
    const rosterEntry = roster.find((m) => m.memberId === memberId);
    if (rosterEntry && !rosterEntry.sensorDeviceId) {
      setAssignMemberId(memberId); // dead block — open assign/absent sheet, not the stats modal
    } else {
      setSelectedMemberId(memberId);
    }
  };

  const allTiles: TileData[] = [...displayList.live, ...displayList.waitingTiles];
  const assignTarget = assignMemberId ? roster.find((m) => m.memberId === assignMemberId) : null;

  return (
    <Screen edges={['top', 'bottom']}>
    <View style={styles.root}>
      {showCountdown && <CountdownOverlay onDone={onCountdownDone} onCancel={onCountdownCancel} />}

      <View style={styles.header}>
        <View>
          <Text style={styles.timer}>{formatElapsed(elapsedSeconds)}</Text>
          <Text style={styles.athleteCount}>
            {displayList.live.length}/{roster.length} connected{isPaused ? ' · paused' : breakActive ? ' · break' : ''}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.lateJoinButton} onPress={() => setShowLateJoin(true)} hitSlop={8}>
            <Plus size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
          <ConnectionStatus />
        </View>
      </View>

      <FlatList
        data={allTiles}
        keyExtractor={(item) => item.memberId}
        numColumns={columns}
        key={columns} // force re-layout if orientation/column-count changes
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: TILE_GAP, marginBottom: TILE_GAP }}
        renderItem={({ item, index }) => (
          <AthleteTile
            tick={item}
            rank={index + 1}
            tileWidth={tileWidth}
            onPress={onTilePress}
            preSession={item.isDropped && item.currentBPM === 0}
            needsSensor={item.needsSensor}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No members in this session — tap + to add one.</Text>
          </View>
        }
      />

      <SessionControlBar
        isActive
        isPaused={isPaused}
        breakActive={breakActive}
        onStart={() => {}}
        onEnd={confirmEnd}
        onPauseResume={onPauseResume}
        onBreak={onBreak}
        onBreakEnd={onBreakEnd}
      />

      {selectedMemberId && (
        <AthleteDetailModal sessionId={route.params.sessionId} memberId={selectedMemberId} tick={ticks.get(selectedMemberId) ?? null} onClose={() => setSelectedMemberId(null)} />
      )}

      {assignTarget && (
        <AssignSensorSheet
          memberId={assignTarget.memberId}
          memberName={assignTarget.memberName}
          // Exclude sensors already assigned to a DIFFERENT member in
          // this session — same protection the pre-session setup
          // screen already has. Without this, a still-broadcasting
          // device shows up in a fresh scan even though it's already
          // in use, and a mis-tap silently steals it (sessionEngine's
          // assignSensor() now handles that case if it happens, but
          // filtering it out of the list here stops the mistake before
          // it's made).
          assignedElsewhere={new Set(roster.filter((m) => m.sensorDeviceId && m.memberId !== assignTarget.memberId).map((m) => m.sensorDeviceId!))}
          onClose={() => setAssignMemberId(null)}
        />
      )}

      {showLateJoin && (
        <LateJoinSheet
          existingMemberIds={new Set(roster.map((m) => m.memberId))}
          onClose={() => setShowLateJoin(false)}
        />
      )}

      {/* End-session calculating overlay — shows while sessionEngine.endSession() */}
      {/* finalizes every member's results (UV score, sweat/recovery/EPOC, zones). */}
      {ending && (
        <View style={styles.endOverlay}>
          <View style={styles.endOverlayCard}>
            <Text style={styles.endOverlayEmoji}>🏆</Text>
            <Text style={styles.endOverlayTitle}>Finalizing Results</Text>
            <Text style={styles.endOverlaySubtitle}>
              {endProgress.total > 0
                ? `Calculating ${endProgress.memberName}… (${endProgress.current}/${endProgress.total})`
                : 'Preparing session results…'}
            </Text>
            {/* Progress bar */}
            {endProgress.total > 0 && (
              <View style={styles.endProgressTrack}>
                <View
                  style={[styles.endProgressFill, { width: `${(endProgress.current / endProgress.total) * 100}%` }]}
                />
              </View>
            )}
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.lg }} />
            <Text style={styles.endOverlayNote}>Hang tight — results are worth the wait!</Text>
          </View>
        </View>
      )}
    </View>
    </Screen>
  );
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function AthleteDetailModal({ sessionId, memberId, tick, onClose }: { sessionId: string; memberId: string; tick: LiveTick | null; onClose: () => void }) {
  const [points, setPoints] = useState<GraphPoint[]>([]);
  const [zoneSeconds, setZoneSeconds] = useState<number[] | Record<string, number> | null>(null);
  const [memberStats, setMemberStats] = useState<{ avgHr: number | null; peakHr: number | null; calories: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getTicksForMember(sessionId, memberId)
        .then((rows) => {
          if (!cancelled) setPoints(rows.map((r) => ({ value: r.bpm })));
        })
        .catch((e) => console.warn('[AthleteDetailModal] Failed to load ticks', e));
      getSessionMembers(sessionId)
        .then((members) => {
          if (cancelled) return;
          const row = (members as unknown as { member_id: string; avg_hr: number | null; peak_hr: number | null; calories: number | null; zone_seconds_json: string | null }[])
            .find((m) => m.member_id === memberId);
          if (row) {
            setMemberStats({ avgHr: row.avg_hr, peakHr: row.peak_hr, calories: row.calories });
            if (row.zone_seconds_json) {
              try { setZoneSeconds(JSON.parse(row.zone_seconds_json)); } catch { /* ignore */ }
            }
          }
        })
        .catch(() => {}); // best-effort for zone data
    };
    load();
    const t = setInterval(load, 2000); // live-refresh while the modal is open
    return () => { cancelled = true; clearInterval(t); };
  }, [sessionId, memberId]);

  const buckets = zoneSecondsToBuckets(zoneSeconds);

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <ScrollView contentContainerStyle={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{tick?.memberName ?? 'Athlete'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {tick && tick.currentBPM > 0 && (
            <View style={styles.modalStatsRow}>
              <ModalStat label="BPM" value={String(tick.currentBPM)} />
              <ModalStat label="%MHR" value={`${Math.round(tick.pctMHR)}%`} />
              <ModalStat label="UV Points" value={String(Math.round(tick.sweatPointsSoFar))} />
            </View>
          )}

          {memberStats && (
            <View style={styles.modalStatsRow}>
              <ModalStat label="Avg BPM" value={memberStats.avgHr != null ? String(Math.round(memberStats.avgHr)) : '—'} />
              <ModalStat label="Peak BPM" value={memberStats.peakHr != null ? String(Math.round(memberStats.peakHr)) : '—'} />
              <ModalStat label="Calories" value={memberStats.calories != null ? `${Math.round(memberStats.calories)} kcal` : '—'} />
            </View>
          )}

          <BpmLineGraph points={points} height={160} emptyLabel={tick && tick.currentBPM === 0 ? 'Waiting for readings…' : 'No readings recorded yet.'} />

          {/* Zone distribution bar + breakdown */}
          {buckets.some((b) => b.seconds > 0) && (
            <View style={styles.modalZoneBlock}>
              <Text style={styles.modalZoneTitle}>Zone Distribution</Text>
              <ZoneDistributionBar buckets={buckets} height={14} />
              <ZoneTimeBreakdown buckets={buckets} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ModalStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.modalStat}>
      <Text style={styles.modalStatValue}>{value}</Text>
      <Text style={styles.modalStatLabel}>{label}</Text>
    </View>
  );
}

/**
 * Tap-a-dead-block sheet — this IS the sensor-assignment flow, live,
 * inline in the session. There's no separate "assign sensor" screen:
 * scan for nearby BLE sensors, tap one to assign, or mark the member
 * absent to pull their block off the grid entirely.
 */
function AssignSensorSheet({
  memberId,
  memberName,
  assignedElsewhere,
  onClose,
}: {
  memberId: string;
  memberName: string;
  assignedElsewhere: Set<string>;
  onClose: () => void;
}) {
  const [nearby, setNearby] = useState<NearbyBLEDevice[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    startNearbyScan(setNearby)
      .then((s) => { stop = s; })
      .catch((e) => setScanError(e instanceof Error ? e.message : 'Could not start Bluetooth scan.'));
    return () => stop?.();
  }, []);

  // Same protection the pre-session setup screen has: don't offer a
  // sensor that's already in use by someone else in this session.
  const selectable = nearby.filter((d) => !assignedElsewhere.has(d.id));

  const assign = async (device: NearbyBLEDevice) => {
    setConnecting(device.id);
    try {
      const deviceId = await registerNearbyDevice(device);
      const bumped = sessionEngine.assignSensor(memberId, deviceId);
      assignSensorToMember(memberId, deviceId).catch(() => {});
      addRegisteredSensor(deviceId).catch(() => {});
      onClose();
      // That sensor was already assigned to someone else in this
      // session — their tile is now a dead block again (correctly, no
      // stale "connected" state left over) but the trainer needs to
      // know to go re-assign them a different sensor.
      if (bumped) {
        Alert.alert(
          'Sensor reassigned',
          `${device.name} was already assigned to ${bumped.bumpedMemberName} — they're now unassigned. Tap their tile to give them a different sensor.`,
        );
      }
    } catch {
      Alert.alert('Could not connect', `Failed to connect to ${device.name}. Try again.`);
    } finally {
      setConnecting(null);
    }
  };

  const markAbsent = () => {
    Alert.alert('Mark Absent', `Mark ${memberName} as absent for this session?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Absent',
        style: 'destructive',
        onPress: () => {
          sessionEngine.markAbsent(memberId).catch(() => {});
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{memberName}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sheetNote}>Tap a nearby sensor to assign it, or mark them absent to remove their block.</Text>

          {scanError && <Text style={styles.sheetError}>{scanError}</Text>}
          {!scanError && selectable.length === 0 && (
            <View style={styles.sheetEmptyWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.sheetEmpty}>
                {nearby.length > 0 ? 'All nearby sensors are already assigned in this session.' : 'Scanning for nearby Polar sensors…'}
              </Text>
            </View>
          )}

          <FlatList
            data={selectable}
            keyExtractor={(d) => d.id}
            style={{ maxHeight: 220 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceRow} onPress={() => assign(item)} disabled={connecting === item.id}>
                <Radio size={16} color={colors.primary} />
                <Text style={styles.deviceName}>{item.name}</Text>
                {connecting === item.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.deviceRssi}>{item.rssi ?? '—'} dBm</Text>}
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.absentButton} onPress={markAbsent}>
            <UserX size={16} color={colors.destructive} />
            <Text style={styles.absentButtonText}>Mark Absent</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/**
 * "+" header button — a late-joiner picks themselves from the gym
 * roster, enters as a dead block, and the trainer taps that block to
 * assign a sensor. No separate flow needed beyond what's already here.
 */
function LateJoinSheet({ existingMemberIds, onClose }: { existingMemberIds: Set<string>; onClose: () => void }) {
  const [members, setMembers] = useState<RemoteMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    membersApi.list()
      .then(setMembers)
      .catch(() => Alert.alert('Could not load', 'Failed to load the member list — check your connection.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const notInSession = members.filter((m) => !existingMemberIds.has(m.id));
    const q = search.trim().toLowerCase();
    if (!q) return notInSession;
    return notInSession.filter((m) => m.name.toLowerCase().includes(q) || m.memberCode.toLowerCase().includes(q));
  }, [members, existingMemberIds, search]);

  const addMember = async (member: RemoteMember) => {
    setAdding(member.id);
    try {
      await sessionEngine.addLateMember(member);
      onClose();
    } catch {
      Alert.alert('Could not add member', 'Try again.');
    } finally {
      setAdding(null);
    }
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Late Joiner</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Search size={16} color={colors.mutedForeground} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search members…"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(m) => m.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={styles.sheetEmpty}>No matching members.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.deviceRow} onPress={() => addMember(item)} disabled={adding === item.id}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  {adding === item.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.deviceRssi}>{item.memberCode}</Text>}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lateJoinButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  timer: { fontFamily: fonts.heading, fontSize: 26, color: colors.foreground },
  athleteCount: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground },
  grid: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  empty: { paddingTop: spacing.xxl, alignItems: 'center' },
  emptyText: { fontFamily: fonts.body, color: colors.mutedForeground },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.foreground },
  modalStatsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  modalStat: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  modalStatValue: { fontFamily: fonts.heading, fontSize: 20, color: colors.primary },
  modalStatLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  modalZoneBlock: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm, marginTop: spacing.md },
  modalZoneTitle: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.mutedForeground },
  sheetNote: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginBottom: spacing.md },
  sheetError: { fontFamily: fonts.body, fontSize: 12, color: colors.destructive, marginBottom: spacing.sm },
  sheetEmptyWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  sheetEmpty: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.md },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  deviceName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground, flex: 1 },
  deviceRssi: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground },
  absentButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.destructive, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md,
  },
  absentButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.destructive },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontFamily: fonts.body, fontSize: 14, color: colors.foreground },
  // End-session calculating overlay
  endOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  endOverlayCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
  },
  endOverlayEmoji: { fontSize: 48, marginBottom: spacing.md },
  endOverlayTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.foreground, marginBottom: spacing.xs },
  endOverlaySubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, textAlign: 'center', marginBottom: spacing.md },
  endProgressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.muted, width: '100%', overflow: 'hidden' },
  endProgressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  endOverlayNote: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, marginTop: spacing.md, textAlign: 'center' },
});
