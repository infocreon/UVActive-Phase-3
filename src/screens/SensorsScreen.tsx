import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform, Modal, useWindowDimensions,
} from 'react-native';
import { Bluetooth, RefreshCw, X, Search, BatteryMedium, SignalHigh, User } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import {
  initBLE, connectPolarSensor, disconnectPolarSensor, addGlobalBLEListener,
  getAllSensorStatuses, getBLEAdapterState, addBLEAdapterStateListener,
  startNearbyScan, registerNearbyDevice, getLastPermissionError, rssiToLabel, rssiToBars,
  type PolarDeviceStatus, type DeviceConnectionState, type NearbyBLEDevice,
} from '../services/ble';
import { State as BLEState } from 'react-native-ble-plx';
import {
  getRegisteredSensors, addRegisteredSensor, removeRegisteredSensor,
  getSensorAssignments, assignSensorToMember, unassignMemberSensor,
} from '../services/sensorRegistry';
import { membersApi, type RemoteMember } from '../services/sessionsApi';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';

const NEARBY_SCAN_MS = 25_000;

function stateColor(s: DeviceConnectionState): string {
  switch (s) {
    case 'connected': return colors.success;
    case 'scanning':
    case 'connecting':
    case 'discovering': return colors.warning;
    case 'error': return colors.destructive;
    default: return colors.mutedForeground;
  }
}

function stateLabel(s: PolarDeviceStatus): string {
  switch (s.state) {
    case 'connected': return s.hr > 0 ? `${s.hr} bpm` : 'Connected — waiting for HR…';
    case 'scanning': return 'Scanning for device…';
    case 'connecting': return 'Connecting…';
    case 'discovering': return 'Discovering services…';
    case 'disconnected': return 'Disconnected — will retry';
    case 'error': return s.error || 'Error';
    default: return 'Idle';
  }
}

/**
 * Defense-in-depth on top of sensorRegistry.ts's own sanitizing: this
 * screen renders member↔sensor assignments in several places, and a
 * screen should never trust that every upstream write path stays
 * perfectly clean forever. A stray non-string value here used to throw
 * straight out of render (`.toUpperCase()` on `undefined`) and take
 * the whole Sensors screen down with it — this makes that structurally
 * impossible regardless of what's actually in the map.
 */
function safeUpper(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value.toUpperCase() : null;
}

export function SensorsScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  const [deviceInput, setDeviceInput] = useState('');
  const [registered, setRegistered] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Record<string, PolarDeviceStatus>>({});
  const [adapterState, setAdapterState] = useState<BLEState>(BLEState.Unknown);
  const [initError, setInitError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Nearby discovery
  const [nearbyScanning, setNearbyScanning] = useState(false);
  const [nearby, setNearby] = useState<NearbyBLEDevice[]>([]);
  const stopNearbyRef = useRef<(() => void) | null>(null);
  const nearbyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assignments (memberId -> deviceId), persisted locally
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<RemoteMember[]>([]);

  // Assign modal state
  const [assignForDevice, setAssignForDevice] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assigning, setAssigning] = useState(false);

  const stopNearbyScan = useCallback(() => {
    if (nearbyTimerRef.current) { clearTimeout(nearbyTimerRef.current); nearbyTimerRef.current = null; }
    if (stopNearbyRef.current) { stopNearbyRef.current(); stopNearbyRef.current = null; }
    setNearbyScanning(false);
  }, []);

  const boot = useCallback(async () => {
    setInitializing(true);
    const [reg, assignMap] = await Promise.all([getRegisteredSensors(), getSensorAssignments()]);
    setRegistered(reg);
    setAssignments(assignMap);
    setMembers((await membersApi.list().catch(() => [] as RemoteMember[])));

    const adapter = await getBLEAdapterState();
    setAdapterState(adapter);

    // initBLE() can reject outright (e.g. the native BLE manager throwing
    // on construction right after launch) rather than just resolving
    // false — every other async call on this screen is guarded the same
    // way, but this one previously wasn't. Left unguarded, that rejection
    // had nowhere to go: boot() is fired fire-and-forget from a useEffect
    // below with no .catch, so it surfaced as an unhandled-rejection error
    // screen right as the tab opened and tried to bring sensors back up,
    // and setInitializing(false) below it never ran, leaving the screen
    // stuck spinning underneath that error too.
    let ready = false;
    try {
      ready = await initBLE();
    } catch (e) {
      setInitializing(false);
      setInitError(e instanceof Error ? e.message : 'Could not start Bluetooth. Try reopening this tab.');
      return;
    }
    setInitializing(false);
    if (!ready) {
      setInitError(getLastPermissionError() || 'Bluetooth is off or permissions denied. Enable Bluetooth and grant permissions.');
      return;
    }
    setInitError(null);
    // Reconnect previously registered sensors.
    for (const id of reg) { connectPolarSensor(id).catch(() => {}); }
  }, []);

  useEffect(() => {
    boot().catch((e) => {
      console.error('[SensorsScreen] boot failed:', e);
      setInitializing(false);
      setInitError(e instanceof Error ? e.message : 'Failed to initialize sensors.');
    });
  }, [boot]);
  useEffect(() => () => stopNearbyScan(), [stopNearbyScan]);

  // Live adapter state
  useEffect(() => {
    const unsub = addBLEAdapterStateListener((state) => {
      const wasOff = adapterState !== BLEState.PoweredOn;
      setAdapterState(state);
      if (state === BLEState.PoweredOn) {
        setInitError(null);
        if (wasOff) {
          getRegisteredSensors().then((ids) => ids.forEach((id) => connectPolarSensor(id).catch(() => {})));
        }
      }
    });
    return unsub;
  }, [adapterState]);

  // Global status listener
  useEffect(() => {
    const unsub = addGlobalBLEListener((deviceId, status) => {
      setStatuses((prev) => ({ ...prev, [deviceId]: status }));
    });
    const current = getAllSensorStatuses();
    if (current.length > 0) {
      const map: Record<string, PolarDeviceStatus> = {};
      for (const s of current) map[s.deviceId] = s;
      setStatuses(map);
    }
    return unsub;
  }, []);

  const memberNameFor = useCallback(
    (deviceId: string): string | null => {
      const upper = deviceId.toUpperCase();
      const entry = Object.entries(assignments).find(([, dev]) => safeUpper(dev) === upper);
      if (!entry) return null;
      return members.find((m) => m.id === entry[0])?.name ?? null;
    },
    [assignments, members],
  );

  const handleConnect = async () => {
    const id = deviceInput.trim().toUpperCase();
    if (!id) { Alert.alert('Required', 'Enter a Polar device ID.'); return; }
    if (adapterState !== BLEState.PoweredOn) { Alert.alert('Bluetooth Off', 'Enable Bluetooth to connect sensors.'); return; }
    // Fully wrapped (not just a `.catch(() => {})` on the connect call) —
    // addRegisteredSensor()'s SecureStore write can itself reject (e.g.
    // storage quota, or a concurrent write on the same key), and an
    // unhandled rejection here previously surfaced as a full-app crash
    // straight to the generic error screen right after tapping Connect,
    // rather than a normal "couldn't connect, try again" message scoped
    // to this screen.
    try {
      await connectPolarSensor(id).catch(() => {});
      const next = await addRegisteredSensor(id);
      setRegistered(next);
      setDeviceInput('');
    } catch (e) {
      Alert.alert('Could not add sensor', e instanceof Error ? e.message : 'Something went wrong — try again.');
    }
  };

  const handleDisconnect = (deviceId: string) => {
    Alert.alert('Remove Sensor', `Disconnect ${deviceId}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          disconnectPolarSensor(deviceId);
          setRegistered(await removeRegisteredSensor(deviceId));
          setStatuses((prev) => { const n = { ...prev }; delete n[deviceId]; return n; });
        },
      },
    ]);
  };

  const handleRetry = async (deviceId: string) => { await connectPolarSensor(deviceId).catch(() => {}); };

  const startNearby = async () => {
    if (adapterState !== BLEState.PoweredOn) { Alert.alert('Bluetooth Off', 'Enable Bluetooth to scan for nearby sensors.'); return; }
    setNearby([]);
    setNearbyScanning(true);
    try {
      const stop = await startNearbyScan(setNearby);
      stopNearbyRef.current = stop;
      nearbyTimerRef.current = setTimeout(stopNearbyScan, NEARBY_SCAN_MS);
    } catch {
      setNearbyScanning(false);
      Alert.alert('Scan failed', 'Could not start the Bluetooth scan. Check permissions and try again.');
    }
  };

  const registerNearby = async (device: NearbyBLEDevice) => {
    const id = device.id.trim().toUpperCase();
    if (registered.includes(id)) { Alert.alert('Already Added', `${device.name} is already in your sensor list.`); return; }
    try {
      await registerNearbyDevice(device).catch(() => {});
      setRegistered(await addRegisteredSensor(id));
      Alert.alert('Sensor Registered', `${device.name} was added and is connecting now.`);
    } catch (e) {
      Alert.alert('Could not add sensor', e instanceof Error ? e.message : 'Something went wrong — try again.');
    }
  };

  const handleAssign = async (memberId: string) => {
    if (!assignForDevice) return;
    setAssigning(true);
    try {
      const next = await assignSensorToMember(memberId, assignForDevice);
      setAssignments(next);
      setAssignForDevice(null);
      setAssignSearch('');
    } catch (e) {
      Alert.alert('Could not assign sensor', e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (memberId: string) => {
    try {
      const next = await unassignMemberSensor(memberId);
      setAssignments(next);
    } catch (e) {
      Alert.alert('Could not unassign sensor', e instanceof Error ? e.message : 'Something went wrong — try again.');
    }
  };

  const openBTSettings = () => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => Linking.openSettings());
    } else {
      Linking.openURL('App-Prefs:Bluetooth');
    }
  };

  const connectedCount = Object.values(statuses).filter((s) => s.state === 'connected').length;

  const assignFiltered = assignSearch.trim()
    ? members.filter((m) => (m.name ?? '').toLowerCase().includes(assignSearch.trim().toLowerCase())).slice(0, 8)
    : members.slice(0, 8);

  return (
    <Screen edges={['top']}>
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>Sensors</Text>
          <Text style={styles.subheading}>Connect Polar sensors and link them to members</Text>
        </View>

        {/* Adapter status */}
        {adapterState !== BLEState.PoweredOn && !initializing && (
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>{adapterState === BLEState.PoweredOff ? 'Bluetooth is Off' : 'Bluetooth Unavailable'}</Text>
            <Text style={styles.alertText}>Enable Bluetooth to connect Polar heart-rate sensors.</Text>
            <TouchableOpacity style={styles.alertBtn} onPress={openBTSettings}>
              <Text style={styles.alertBtnText}>Open Bluetooth Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {initError && adapterState === BLEState.PoweredOn && (
          <View style={[styles.alertCard, { borderColor: colors.warning + '55' }]}>
            <Text style={[styles.alertTitle, { color: colors.warning }]}>Permission Required</Text>
            <Text style={styles.alertText}>{initError}</Text>
            <TouchableOpacity style={styles.alertBtn} onPress={openBTSettings}>
              <Text style={styles.alertBtnText}>Open App Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status chips */}
        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <View style={[styles.chipDot, { backgroundColor: adapterState === BLEState.PoweredOn ? colors.success : colors.mutedForeground }]} />
            <Text style={styles.chipText}>BT {adapterState === BLEState.PoweredOn ? 'On' : 'Off'}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{connectedCount}/{registered.length} Connected</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{Object.values(assignments).length} Assigned</Text>
          </View>
        </View>

        {/* Manual connect */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connect Polar Sensor</Text>
          <Text style={styles.cardSub}>Enter the device ID from the sensor label (H10, H9, Verity Sense, OH1).</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={deviceInput}
              onChangeText={(t) => setDeviceInput(t.toUpperCase())}
              placeholder="e.g. C2:1F:4A:B3 or 17518934"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="done"
              onSubmitEditing={handleConnect}
            />
            <TouchableOpacity
              style={[styles.connectBtn, (initializing || adapterState !== BLEState.PoweredOn) && styles.disabled]}
              onPress={handleConnect}
              disabled={initializing || adapterState !== BLEState.PoweredOn}
            >
              {initializing ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={styles.connectBtnText}>Connect</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Nearby scan */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Nearby Polar Sensors</Text>
              <Text style={styles.cardSub}>Discover every Polar sensor in range, including unregistered ones.</Text>
            </View>
            <TouchableOpacity style={[styles.scanBtn, nearbyScanning && styles.scanBtnActive]} onPress={nearbyScanning ? stopNearbyScan : startNearby} disabled={initializing || adapterState !== BLEState.PoweredOn}>
              {nearbyScanning ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.scanBtnText}>Scan</Text>}
            </TouchableOpacity>
          </View>

          {nearbyScanning && <Text style={styles.scanHint}>Scanning for Polar sensors… (auto-stops in 25s)</Text>}
          {!nearbyScanning && nearby.length === 0 && <Text style={styles.scanHint}>Tap Scan to discover Polar sensors nearby.</Text>}

          {nearby.map((device) => {
            const already = registered.includes(device.id.trim().toUpperCase());
            const assignedName = memberNameFor(device.id);
            return (
              <View key={device.id} style={styles.nearbyRow}>
                <View style={[styles.deviceDot, { backgroundColor: already ? colors.success : colors.warning }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.nearbyName} numberOfLines={1}>{device.name}</Text>
                  <Text style={styles.nearbyMeta} numberOfLines={1}>
                    {device.id}{device.rssi != null ? ` · ${device.rssi} dBm (${rssiToLabel(device.rssi)})` : ''}{assignedName ? ` · → ${assignedName}` : ''}
                  </Text>
                </View>
                {already ? (
                  <View style={styles.alreadyPill}><Text style={styles.alreadyPillText}>Added</Text></View>
                ) : (
                  <TouchableOpacity style={styles.registerBtn} onPress={() => registerNearby(device)}>
                    <Text style={styles.registerBtnText}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Active sensors */}
        {registered.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Sensors ({registered.length})</Text>
            <Text style={styles.cardSub}>Registered on this device — tap Assign to link a member.</Text>
            <View style={[styles.sensorGrid, wide && styles.sensorGrid2]}>
              {registered.map((deviceId) => {
                const s = statuses[deviceId];
                const memberName = memberNameFor(deviceId);
                const sc = s ? stateColor(s.state) : colors.mutedForeground;
                const isConnected = s?.state === 'connected';
                const isError = s?.state === 'error';
                const isBusy = s && ['scanning', 'connecting', 'discovering'].includes(s.state);
                const memberId = Object.entries(assignments).find(([, dev]) => safeUpper(dev) === deviceId.toUpperCase())?.[0];
                return (
                  <View key={deviceId} style={[styles.sensorCard, wide && styles.sensorCardWide]}>
                    <View style={styles.sensorTop}>
                      <View style={[styles.deviceDot, { backgroundColor: sc }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.sensorId} numberOfLines={1}>{s?.deviceName && s.deviceName !== deviceId ? s.deviceName : deviceId}</Text>
                        {memberName && (
                          <View style={styles.assignedRow}>
                            <User size={10} color={colors.primary} />
                            <Text style={styles.assignedText} numberOfLines={1}>{memberName}</Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity style={styles.removeBtn} onPress={() => handleDisconnect(deviceId)} hitSlop={8}>
                        <X size={14} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.sensorStatusRow}>
                      {isBusy && <ActivityIndicator size="small" color={sc} style={{ marginRight: 6 }} />}
                      <Text style={[styles.sensorStatusText, { color: sc }]} numberOfLines={1}>{s ? stateLabel(s) : 'Connecting…'}</Text>
                      {isError && (
                        <TouchableOpacity style={styles.retryBtn} onPress={() => handleRetry(deviceId)}>
                          <RefreshCw size={12} color={colors.destructive} />
                          <Text style={styles.retryBtnText}>Retry</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {isConnected && (
                      <View style={styles.metricsRow}>
                        <View style={styles.metricPill}>
                          <SignalHigh size={11} color={colors.mutedForeground} />
                          <Text style={styles.metricText}>{s?.rssi != null ? `${rssiToBars(s.rssi)}/4` : '—'}</Text>
                        </View>
                        <View style={styles.metricPill}>
                          <BatteryMedium size={11} color={s && s.battery <= 20 ? colors.destructive : colors.mutedForeground} />
                          <Text style={styles.metricText}>{s && s.battery >= 0 ? `${s.battery}%` : '—'}</Text>
                        </View>
                        {isConnected && s?.isStale && <Text style={styles.staleText}>No signal — check strap</Text>}
                      </View>
                    )}

                    {memberId ? (
                      <TouchableOpacity style={styles.unassignBtn} onPress={() => handleUnassign(memberId)}>
                        <Text style={styles.unassignBtnText}>Unassign from {memberName ?? 'member'}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.assignBtn} onPress={() => setAssignForDevice(deviceId)}>
                        <User size={13} color={colors.primary} />
                        <Text style={styles.assignBtnText}>Assign to Member</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {registered.length === 0 && !initializing && (
          <EmptyState
            icon={Bluetooth}
            title="No sensors registered"
            subtitle="Scan nearby or enter a device ID above to add Polar sensors."
            compact
          />
        )}
      </ScrollView>

      {/* Assign-to-member modal */}
      <Modal visible={!!assignForDevice} animationType="slide" transparent onRequestClose={() => setAssignForDevice(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Assign Sensor</Text>
                <Text style={styles.modalSub}>{assignForDevice}</Text>
              </View>
              <TouchableOpacity onPress={() => setAssignForDevice(null)} hitSlop={10}>
                <X size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchRow}>
              <Search size={15} color={colors.mutedForeground} />
              <TextInput
                style={styles.modalSearchInput}
                value={assignSearch}
                onChangeText={setAssignSearch}
                placeholder="Search members…"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                autoCorrect={false}
              />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {assignFiltered.length === 0 && <Text style={styles.modalEmpty}>{members.length === 0 ? 'No members registered yet.' : 'No matches.'}</Text>}
              {assignFiltered.map((m) => {
                const already = assignForDevice != null && Object.entries(assignments).some(([mid, dev]) => mid === m.id && safeUpper(dev) !== assignForDevice.toUpperCase());
                return (
                  <TouchableOpacity key={m.id} style={styles.modalMemberRow} disabled={assigning} onPress={() => handleAssign(m.id)}>
                    <View style={styles.modalAvatar}>
                      <Text style={styles.modalAvatarText}>{(m.name ?? '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalMemberName}>{m.name}</Text>
                      {already && <Text style={styles.modalMemberMeta}>Already has a sensor — will reassign</Text>}
                    </View>
                    {assigning && <ActivityIndicator size="small" color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { marginBottom: spacing.xs },
  heading: { fontFamily: fonts.heading, fontSize: 24, color: colors.foreground },
  subheading: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  alertCard: { backgroundColor: colors.destructive + '14', borderRadius: radius.lg, padding: spacing.md, gap: 8, borderWidth: 1, borderColor: colors.destructive + '44' },
  alertTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.destructive },
  alertText: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, lineHeight: 18 },
  alertBtn: { backgroundColor: colors.destructive + '22', borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start' },
  alertBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.destructive },
  chipsRow: { flexDirection: 'row', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.foreground },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.foreground },
  cardSub: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, lineHeight: 16 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontFamily: fonts.body, fontSize: 14, color: colors.foreground, letterSpacing: 0.5,
  },
  connectBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  connectBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primaryForeground },
  disabled: { opacity: 0.4 },
  scanBtn: { backgroundColor: colors.primary + '22', borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 8, minWidth: 64, alignItems: 'center', borderWidth: 1, borderColor: colors.primary + '55' },
  scanBtnActive: { backgroundColor: colors.primary + '11' },
  scanBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primary },
  scanHint: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground },
  nearbyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  deviceDot: { width: 9, height: 9, borderRadius: 5 },
  nearbyName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.foreground },
  nearbyMeta: { fontFamily: fonts.body, fontSize: 10.5, color: colors.mutedForeground, marginTop: 1 },
  registerBtn: { backgroundColor: colors.success + '1A', borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: colors.success + '55' },
  registerBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.success },
  alreadyPill: { backgroundColor: colors.muted, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 7 },
  alreadyPillText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.mutedForeground },
  sensorGrid: { gap: spacing.sm, marginTop: spacing.xs },
  sensorGrid2: { flexDirection: 'row', flexWrap: 'wrap' },
  sensorCard: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  sensorCardWide: { width: '48.5%' },
  sensorTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sensorId: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.foreground },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  assignedText: { fontFamily: fonts.body, fontSize: 11, color: colors.primary },
  removeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  sensorStatusRow: { flexDirection: 'row', alignItems: 'center', minHeight: 18 },
  sensorStatusText: { fontFamily: fonts.bodyMedium, fontSize: 12, flex: 1 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.destructive + '22', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  retryBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: colors.destructive },
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  metricPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.muted, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  metricText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.foreground },
  staleText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.warning },
  assignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary + '1A', borderRadius: radius.sm, paddingVertical: 9, borderWidth: 1, borderColor: colors.primary + '44' },
  assignBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primary },
  unassignBtn: { backgroundColor: colors.muted, borderRadius: radius.sm, paddingVertical: 9, alignItems: 'center' },
  unassignBtnText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.mutedForeground },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '78%', paddingBottom: spacing.xxl },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  modalTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.foreground },
  modalSub: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  modalSearchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  modalSearchInput: { flex: 1, paddingVertical: spacing.sm, fontFamily: fonts.body, fontSize: 14, color: colors.foreground },
  modalEmpty: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, paddingVertical: spacing.lg, textAlign: 'center' },
  modalMemberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  modalAvatarText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.foreground },
  modalMemberName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  modalMemberMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.warning, marginTop: 1 },
});
