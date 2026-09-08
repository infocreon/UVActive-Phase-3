/**
 * UV Active — Athlete Tile.
 * Ported from the old app's component of the same name — the only
 * change is the data source: this now takes a formula-engine LiveTick
 * directly (memberId/currentBPM/pctMHR/currentZone/zoneColour/
 * sweatPointsSoFar/rssi/isDropped all already match 1:1), rather than
 * a separate AthleteDisplay type the old hub-relay path constructed.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import type { LiveTick } from '../lib/formula-engine';
import { ZONE_NAMES } from '../lib/formula-engine';
import { colors } from '../theme/tokens';
import { rssiToBars } from '../services/ble';

interface Props {
  tick: LiveTick;
  rank: number;
  tileWidth: number;
  onPress: (memberId: string) => void;
  preSession?: boolean;
  /** No sensor assigned yet — a "dead block". Always tappable (to assign one or mark absent), rendered distinctly from a normal waiting-for-signal tile. */
  needsSensor?: boolean;
}

function initialsOf(name: string): string {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function AthleteTile({ tick, rank, tileWidth, onPress, preSession = false, needsSensor = false }: Props) {
  const tileHeight = tileWidth * 1.18;
  const isDropped = !!tick.isDropped && !preSession;
  // Reconnecting is distinct from dropped: the member HAS real history
  // this session, the watchdog is currently gap-filling from their own
  // trend, and the tile keeps showing a live-looking BPM/zone (that's
  // the point — the trainer shouldn't have to babysit a 15-20s blip).
  // The only visible difference is a quiet pill, never "--" / blank.
  const isReconnecting = !!tick.isReconnecting && !preSession && !isDropped;

  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isReconnecting) { pulseAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isReconnecting]);
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  const bgAnim = useRef(new Animated.Value(0)).current;
  const prevColorRef = useRef(tick.zoneColour || colors.zone[0]);
  const currColorRef = useRef(tick.zoneColour || colors.zone[0]);

  useEffect(() => {
    if (preSession || isDropped) return;
    const newColor = tick.zoneColour || colors.zone[tick.currentZone ?? 0];
    if (newColor !== currColorRef.current) {
      prevColorRef.current = currColorRef.current;
      currColorRef.current = newColor;
      bgAnim.setValue(0);
      Animated.timing(bgAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start();
    }
  }, [tick.currentZone, tick.zoneColour]);

  const animatedBg = bgAnim.interpolate({ inputRange: [0, 1], outputRange: [prevColorRef.current, currColorRef.current] });

  const rankBadgeStyle = rank === 1 ? styles.rankGold : rank === 2 ? styles.rankSilver : rank === 3 ? styles.rankBronze : styles.rankDefault;
  const tileBg = needsSensor ? undefined : preSession ? '#1c1c1c' : isDropped ? '#1a1a2e' : undefined;
  const initials = initialsOf(tick.memberName);

  if (needsSensor) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(tick.memberId)} style={{ width: tileWidth, height: tileHeight }}>
        <View style={[styles.tile, styles.deadBlock, { width: tileWidth, height: tileHeight }]}>
          <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
            <Text style={[styles.avatarText, { color: 'rgba(255,255,255,0.5)' }]}>{initials}</Text>
          </View>
          <Text style={styles.deadBlockName} numberOfLines={1}>{tick.memberName}</Text>
          <Text style={styles.deadBlockLabel}>Tap to assign sensor</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={preSession ? 0.95 : 0.82}
      onPress={() => !preSession && onPress(tick.memberId)}
      style={{ width: tileWidth, height: tileHeight }}
    >
      <Animated.View
        style={[
          styles.tile,
          { width: tileWidth, height: tileHeight, opacity: isDropped ? 0.7 : 1 },
          tileBg ? { backgroundColor: tileBg } : { backgroundColor: animatedBg },
        ]}
      >
        <View style={[styles.rankBadge, preSession ? styles.rankPre : rankBadgeStyle]}>
          <Text style={[styles.rankText, preSession && { color: '#333' }]}>{rank}</Text>
        </View>

        <View style={[styles.avatar, preSession && { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
          <Text style={[styles.avatarText, preSession && { color: '#3a3a3a' }]}>{initials}</Text>
        </View>

        {!preSession && !isDropped && (
          <View style={styles.zoneBadge}>
            <Text style={styles.zoneText}>{ZONE_NAMES[tick.currentZone ?? 0]}</Text>
          </View>
        )}

        {!preSession && !isDropped && tick.rssi !== undefined && tick.rssi !== null && !isReconnecting && <SignalMeter rssi={tick.rssi} />}
        {isReconnecting && (
          <Animated.View style={[styles.reconnectPill, { opacity: pulseOpacity }]}>
            <Text style={styles.reconnectText}>Reconnecting…</Text>
          </Animated.View>
        )}

        {preSession ? (
          <Text style={styles.pctPre}>--</Text>
        ) : isDropped ? (
          <>
            <Text style={styles.pctDropped}>--</Text>
            <Text style={styles.droppedLabel}>Signal Lost</Text>
          </>
        ) : (
          <View style={styles.hrRow}>
            <Text style={styles.pctMHR}>{Math.round(tick.pctMHR)}</Text>
            <Text style={styles.pctSym}>%</Text>
            <Text style={styles.heart}>♥</Text>
          </View>
        )}

        <View style={styles.uvRow}>
          <Text style={[styles.uvIcon, preSession && { color: '#2a2a2a' }]}>⚡</Text>
          <Text style={[styles.uvPts, preSession && { color: '#2a2a2a' }]}>{preSession ? '--' : Math.round(tick.sweatPointsSoFar)}</Text>
          <Text style={[styles.uvLabel, preSession && { color: '#2a2a2a' }]}> UV</Text>
        </View>

        {!preSession && (
          <View style={styles.tapHint}>
            <Text style={styles.tapDots}>···</Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

function SignalMeter({ rssi }: { rssi: number }) {
  const bars = rssiToBars(rssi);
  const barColor = bars <= 1 ? '#FF5E73' : bars === 2 ? '#F5C518' : 'rgba(255,255,255,0.85)';
  return (
    <View style={styles.signalMeter}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.signalBar, { height: 3 + i * 2, backgroundColor: i <= bars ? barColor : 'rgba(255,255,255,0.18)' }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 8, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  deadBlock: {
    backgroundColor: 'rgba(255,94,115,0.06)', borderWidth: 1.5, borderColor: 'rgba(255,94,115,0.35)', borderStyle: 'dashed',
    gap: 4, paddingHorizontal: 6,
  },
  deadBlockName: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  deadBlockLabel: { color: '#FF5E73', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  rankBadge: { position: 'absolute', top: 6, left: 7, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  rankGold: { backgroundColor: '#D97706' },
  rankSilver: { backgroundColor: '#6B7280' },
  rankBronze: { backgroundColor: '#92400E' },
  rankDefault: { backgroundColor: 'rgba(0,0,0,0.35)' },
  rankPre: { backgroundColor: 'rgba(255,255,255,0.04)' },
  rankText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  zoneBadge: { backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 2 },
  zoneText: { color: 'rgba(255,255,255,0.8)', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  hrRow: { flexDirection: 'row', alignItems: 'flex-end' },
  pctMHR: { color: '#fff', fontSize: 34, fontWeight: '900', lineHeight: 38, letterSpacing: -1 },
  pctSym: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700', marginBottom: 4, marginLeft: 1 },
  heart: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 4, marginLeft: 3 },
  pctDropped: { color: '#555', fontSize: 34, fontWeight: '900' },
  pctPre: { color: '#333', fontSize: 34, fontWeight: '900' },
  droppedLabel: { color: '#555', fontSize: 10, marginTop: 2 },
  uvRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  uvIcon: { fontSize: 10, color: 'rgba(255,255,255,0.75)' },
  uvPts: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  uvLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  tapHint: { position: 'absolute', bottom: 5, right: 7 },
  tapDots: { color: 'rgba(255,255,255,0.25)', fontSize: 10 },
  signalMeter: { position: 'absolute', top: 8, right: 7, flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 },
  signalBar: { width: 3, borderRadius: 1 },
  reconnectPill: {
    position: 'absolute', top: 6, right: 7, backgroundColor: 'rgba(245,197,24,0.18)',
    borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1.5,
  },
  reconnectText: { color: '#F5C518', fontSize: 8, fontWeight: '700' },
});
