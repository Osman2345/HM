import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { loadAdminBookings, type AdminBooking } from '@/services/admin';
import type { BookingStatus } from '@/types/database';

type BookingFilter = BookingStatus | 'all';
const filters: BookingFilter[] = ['pending', 'confirmed', 'completed', 'cancelled', 'all'];

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-SL', { style: 'currency', currency: 'SLL', maximumFractionDigits: 0 }).format(Number(amount) || 0);

export default function AdminBookingsScreen() {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setBookings(await loadAdminBookings(filter));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load bookings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeout);
  }, [refresh]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <Text style={styles.heading}>All bookings</Text>
      <View style={styles.filters}>
        {filters.map((item) => (
          <TouchableOpacity
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item }}
            style={[styles.filter, filter === item && styles.filterSelected]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterText, filter === item && styles.filterTextSelected]}>
              {item === 'all' ? 'All' : item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <Text style={styles.state}>Loading bookings…</Text> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void refresh()}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && bookings.length === 0 ? <Text style={styles.state}>No bookings match this filter.</Text> : null}
      {bookings.map((booking) => (
        <View key={booking.id} style={styles.card}>
          <Text style={styles.id}>Booking {booking.id.slice(0, 8)}</Text>
          <Text style={styles.title}>{booking.hotels?.name ?? 'Hotel unavailable'}</Text>
          <Text style={styles.meta}>Guest: {booking.users?.fullname ?? booking.users?.email ?? 'Deleted account'}</Text>
          <Text style={styles.meta}>Stay: {booking.check_in} to {booking.check_out}</Text>
          <Text style={styles.meta}>{booking.guests} guests · {booking.rooms} room(s)</Text>
          <Text style={styles.meta}>Booking: {booking.booking_status} · Payment: {booking.payment_status}</Text>
          <Text style={styles.amount}>{formatMoney(booking.total_price)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#E2E8F0' },
  filterSelected: { backgroundColor: '#1D4ED8' },
  filterText: { color: '#334155', textTransform: 'capitalize', fontWeight: '600' },
  filterTextSelected: { color: '#FFFFFF' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C' },
  card: { padding: 14, gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12 },
  id: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  meta: { color: '#475569' },
  amount: { marginTop: 4, color: '#1D4ED8', fontWeight: '700', fontSize: 18 },
  button: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1D4ED8' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
