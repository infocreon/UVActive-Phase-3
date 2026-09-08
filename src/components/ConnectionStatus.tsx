import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Wifi, WifiOff, RefreshCw, Check } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import { isOnline, addNetworkListener } from '../services/networkStatus';
import { addSyncListener } from '../services/syncQueue';

export function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  const [queueDepth, setQueueDepth] = useState(0);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    isOnline().then(setOnline);
    const unsubNet = addNetworkListener(setOnline);
    const unsubSync = addSyncListener((s) => { setQueueDepth(s.queueDepth); setFlushing(s.flushing); });
    return () => { unsubNet(); unsubSync(); };
  }, []);

  if (!online) {
    return (
      <View style={[styles.pill, styles.offline]}>
        <WifiOff size={12} color={colors.warning} />
        <Text style={styles.textWarn}>Offline — session keeps recording locally</Text>
      </View>
    );
  }
  if (queueDepth > 0) {
    return (
      <View style={[styles.pill, styles.syncing]}>
        <RefreshCw size={12} color={colors.info} />
        <Text style={styles.textInfo}>{flushing ? 'Syncing…' : `${queueDepth} pending sync`}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, styles.synced]}>
      <Check size={12} color={colors.success} />
      <Text style={styles.textOk}>Synced</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start' },
  offline: { backgroundColor: colors.warning + '22' },
  syncing: { backgroundColor: colors.info + '22' },
  synced: { backgroundColor: colors.success + '22' },
  textWarn: { color: colors.warning, fontFamily: fonts.bodyMedium, fontSize: 11 },
  textInfo: { color: colors.info, fontFamily: fonts.bodyMedium, fontSize: 11 },
  textOk: { color: colors.success, fontFamily: fonts.bodyMedium, fontSize: 11 },
});
