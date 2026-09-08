import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { CalendarClock, XCircle, Trophy, Bell } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import { notificationsApi, type MemberNotification } from '../services/notificationsApi';
import { ApiError } from '../services/api';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Screen } from '../components/Screen';

function iconFor(type: string) {
  if (type === 'session_scheduled') return <CalendarClock size={18} color={colors.primary} />;
  if (type === 'session_cancelled') return <XCircle size={18} color={colors.destructive} />;
  if (type === 'result_ready') return <Trophy size={18} color={colors.info} />;
  return <Bell size={18} color={colors.mutedForeground} />;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function NotificationsScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<MemberNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setItems(data);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePress = async (item: MemberNotification) => {
    if (!item.readAt) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
      notificationsApi.markRead(item.id).catch(() => {});
    }
    if (item.type === 'session_scheduled' && item.data?.sessionId) {
      navigation.navigate('BookSession');
    }
  };

  if (loading) {
    return (
      <Screen edges={['bottom']} style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} style={styles.root}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Bell size={22} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>Nothing yet — you'll see new sessions and updates from your gym here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.row, !item.readAt && styles.rowUnread]} activeOpacity={0.8} onPress={() => handlePress(item)}>
            <View style={styles.rowIcon}>{iconFor(item.type)}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title ?? 'Notification'}</Text>
              <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
              <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
            </View>
            {!item.readAt && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },

  errorBanner: { backgroundColor: colors.warning + '1A', borderRadius: radius.md, padding: spacing.sm, margin: spacing.lg, marginBottom: 0 },
  errorBannerText: { fontFamily: fonts.body, fontSize: 12, color: colors.warning },

  list: { padding: spacing.lg, gap: spacing.sm },

  emptyCard: { alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, marginTop: spacing.xl },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm,
  },
  rowUnread: { borderColor: colors.primary + '55' },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fonts.headingMedium, fontSize: 14, color: colors.foreground },
  rowBody: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  rowTime: { fontFamily: fonts.body, fontSize: 10, color: colors.mutedForeground, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 4 },
});
