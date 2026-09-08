import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, Users, Check } from 'lucide-react-native';
import { colors, fonts, radius, spacing, shadow } from '../theme/tokens';
import { sessionsApi, type AvailableSession } from '../services/sessionsApi';
import { ApiError } from '../services/api';
import { Screen } from '../components/Screen';

// Same rotating set of class photos the Trainer App uses for its
// session rows/Quick-Start card, so a session looks the same whether a
// trainer or a member is looking at it.
const sessionPhotos = [
  require('../../assets/class-hiit.jpg'),
  require('../../assets/class-boxing.jpg'),
  require('../../assets/class-cycling.jpg'),
  require('../../assets/class-yoga.jpg'),
];
function photoFor(index: number) {
  return sessionPhotos[index % sessionPhotos.length];
}

function timeLabel(session: AvailableSession): string {
  if (!session.scheduledAt) return 'Unscheduled';
  const d = new Date(session.scheduledAt);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const datePart = sameDay ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${datePart}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function BookSessionScreen() {
  const [sessions, setSessions] = useState<AvailableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await sessionsApi.available();
      setSessions(data);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load sessions — check your connection.");
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

  const handleBook = async (session: AvailableSession) => {
    if (session.isBooked || session.spotsOpen <= 0) return;
    setBookingId(session.id);
    try {
      await sessionsApi.book(session.id);
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, isBooked: true, spotsOpen: Math.max(0, s.spotsOpen - 1) } : s)));
    } catch (e) {
      Alert.alert('Could not book', e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setBookingId(null);
    }
  };

  const handleCancel = (session: AvailableSession) => {
    Alert.alert('Cancel booking?', `Give up your spot in "${session.name}"?`, [
      { text: 'Keep my spot', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          setBookingId(session.id);
          try {
            await sessionsApi.cancelBooking(session.id);
            setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, isBooked: false, spotsOpen: s.spotsOpen + 1 } : s)));
          } catch (e) {
            Alert.alert('Could not cancel', e instanceof ApiError ? e.message : 'Please try again.');
          } finally {
            setBookingId(null);
          }
        },
      },
    ]);
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
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No upcoming sessions to book right now — check back once your gym schedules one.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const full = !item.isBooked && item.spotsOpen <= 0;
          const busy = bookingId === item.id;
          return (
            <View style={styles.card}>
              <Image source={photoFor(index)} style={styles.cardImage} resizeMode="cover" />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardTrainer} numberOfLines={1}>{item.trainer?.name ?? 'UV Active trainer'}</Text>
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Clock size={13} color={colors.mutedForeground} />
                    <Text style={styles.metaText}>{timeLabel(item)}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Users size={13} color={colors.mutedForeground} />
                    <Text style={styles.metaText}>
                      {item.capacity - item.spotsOpen}/{item.capacity} · sensor slot{item.capacity === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>

                {item.isBooked ? (
                  <TouchableOpacity style={styles.bookedButton} onPress={() => handleCancel(item)} disabled={busy}>
                    {busy ? <ActivityIndicator color={colors.primary} size="small" /> : (
                      <>
                        <Check size={14} color={colors.success} />
                        <Text style={styles.bookedButtonText}>Booked — tap to cancel</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.bookButton, full && styles.bookButtonDisabled]}
                    onPress={() => handleBook(item)}
                    disabled={full || busy}
                  >
                    {busy ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : (
                      <Text style={styles.bookButtonText}>{full ? 'Full' : 'Book Session'}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },

  errorBanner: { backgroundColor: colors.warning + '1A', borderRadius: radius.md, padding: spacing.sm, margin: spacing.lg, marginBottom: 0 },
  errorBannerText: { fontFamily: fonts.body, fontSize: 12, color: colors.warning },

  list: { padding: spacing.lg, gap: spacing.md },

  emptyCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: 'center', marginTop: spacing.xl },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },

  card: {
    backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', ...shadow.card, marginBottom: spacing.md,
  },
  cardImage: { width: '100%', height: 140 },
  cardBody: { padding: spacing.md },
  cardTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.foreground },
  cardTrainer: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 2 },

  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground },

  bookButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  bookButtonDisabled: { backgroundColor: colors.muted },
  bookButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.primaryForeground },

  bookedButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.success + '55', backgroundColor: colors.success + '15',
    borderRadius: radius.md, paddingVertical: spacing.sm,
  },
  bookedButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.success },
});
