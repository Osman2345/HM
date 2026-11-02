import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { getCached, invalidateCached, loadCached } from '@/lib/query-cache';

interface VendorBooking {
  id: string;
  booking_status: string;
  payment_status: string;
  payment_method: 'monime' | 'pay_at_hotel';
  voucher_code: string | null;
  room_type: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  rooms: number;
  total_price: number;
  created_at: string;
  hotels: { name: string; owner_id: string } | null;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export default function VendorBookingsScreen() {
  const userId = useAuthStore((state) => state.session?.user.id ?? null);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, { guest_name: string; guest_phone: string | null }>>({});
  const [contactBusyId, setContactBusyId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const loadBookings = useCallback(async (pull = false) => {
    if (!userId) {
      setBookings([]);
      setError('Sign in again to view your bookings.');
      setLoading(false);
      return;
    }
    const cacheKey = `vendor-bookings:${userId}`;
    if (pull) setRefreshing(true);
    else if (!getCached<VendorBooking[]>(cacheKey)) setLoading(true);
    setError(null);

    try {
      const data = await loadCached(cacheKey, async () => {
        const { data: rows, error: fetchError } = await supabase
          .from('bookings')
          .select('id, booking_status, payment_status, payment_method, voucher_code, room_type, check_in, check_out, guests, rooms, total_price, created_at, hotels!inner(name, owner_id)')
          .eq('hotels.owner_id', userId)
          .order('created_at', { ascending: false });
        if (fetchError) throw fetchError;
        return (rows ?? []) as VendorBooking[];
      }, 20000, pull);
      setBookings(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load bookings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const refreshBookings = useCallback(() => {
    if (userId) invalidateCached(`vendor-bookings:${userId}`);
    void loadBookings(true);
  }, [loadBookings, userId]);

  const loadGuestContact = async (bookingId: string) => {
    setContactBusyId(bookingId);
    setError(null);
    const { data, error: contactError } = await supabase.rpc('get_vendor_booking_contact', { p_booking_id: bookingId });
    if (contactError) {
      setError(contactError.message);
    } else if (data?.[0]) {
      setContacts((current) => ({ ...current, [bookingId]: data[0] }));
    }
    setContactBusyId(null);
  };

  const updateBookingStatus = async (bookingId: string, status: 'confirmed' | 'checked_out' | 'no_show') => {
    setActionBusyId(bookingId);
    setError(null);
    const { data, error: statusError } = await supabase.rpc('vendor_update_booking_status', {
      p_booking_id: bookingId,
      p_status: status,
    });
    if (statusError) {
      setError(statusError.message);
    } else if (data) {
      setBookings((current) => current.map((booking) => booking.id === bookingId ? {
        ...booking,
        booking_status: data.booking_status,
        payment_status: data.payment_status,
        voucher_code: data.voucher_code,
      } : booking));
      if (userId) invalidateCached(`vendor-dashboard:${userId}`);
      if (userId) invalidateCached(`vendor-bookings:${userId}`);
    }
    setActionBusyId(null);
  };

  useFocusEffect(useCallback(() => {
    void loadBookings();
  }, [loadBookings]));

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshBookings} />}
    >
      <Text style={styles.heading}>Bookings</Text>
      <Text style={styles.subtitle}>Guest reservations across your properties.</Text>
      {loading ? <Text style={styles.state}>Loading bookings…</Text> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => void loadBookings()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && bookings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptyText}>Guest bookings for your properties will appear here.</Text>
        </View>
      ) : null}
      {bookings.map((booking) => (
        <View key={booking.id} style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.code}>Booking {booking.id.slice(0, 8)}</Text>
            <Text style={styles.status}>{booking.booking_status}</Text>
          </View>
          <Text style={styles.hotel}>{booking.hotels?.name ?? 'Deleted property'}</Text>
          <Text style={styles.meta}>{booking.room_type ?? 'Room'} · {booking.payment_method === 'pay_at_hotel' ? 'Pay at hotel' : 'Paid online'}</Text>
          <Text style={styles.meta}>Stay: {booking.check_in} – {booking.check_out}</Text>
          <Text style={styles.meta}>{booking.guests} guests · {booking.rooms} room(s)</Text>
          <View style={styles.footer}>
            <Text style={styles.payment}>Payment: {booking.payment_status}</Text>
            <Text style={styles.amount}>{formatMoney(booking.total_price)}</Text>
          </View>
          {booking.voucher_code ? <Text style={styles.voucher}>Voucher {booking.voucher_code}</Text> : null}
          {booking.booking_status === 'pending' && booking.payment_method === 'pay_at_hotel' ? (
            <TouchableOpacity style={styles.actionButton} disabled={actionBusyId === booking.id} onPress={() => void updateBookingStatus(booking.id, 'confirmed')} accessibilityRole="button">
              <Text style={styles.actionText}>{actionBusyId === booking.id ? 'Saving…' : 'Confirm reservation'}</Text>
            </TouchableOpacity>
          ) : null}
          {booking.booking_status === 'confirmed' && booking.check_in <= new Date().toISOString().slice(0, 10) && booking.check_out > new Date().toISOString().slice(0, 10) ? (
            <TouchableOpacity style={styles.noShowButton} disabled={actionBusyId === booking.id} onPress={() => void updateBookingStatus(booking.id, 'no_show')} accessibilityRole="button">
              <Text style={styles.noShowText}>{actionBusyId === booking.id ? 'Saving…' : 'Mark no-show'}</Text>
            </TouchableOpacity>
          ) : null}
          {booking.booking_status === 'confirmed' && booking.check_out <= new Date().toISOString().slice(0, 10) ? (
            <TouchableOpacity style={styles.actionButton} disabled={actionBusyId === booking.id} onPress={() => void updateBookingStatus(booking.id, 'checked_out')} accessibilityRole="button">
              <Text style={styles.actionText}>{actionBusyId === booking.id ? 'Saving…' : booking.payment_method === 'pay_at_hotel' ? 'Mark checked out & paid' : 'Mark checked out'}</Text>
            </TouchableOpacity>
          ) : null}
          {booking.payment_status === 'paid' || booking.booking_status === 'confirmed' ? (
            contacts[booking.id] ? (
              <Text style={styles.contact}>Guest: {contacts[booking.id].guest_name} · {contacts[booking.id].guest_phone || 'No phone provided'}</Text>
            ) : (
              <TouchableOpacity style={styles.contactButton} disabled={contactBusyId === booking.id} onPress={() => void loadGuestContact(booking.id)} accessibilityRole="button">
                <Text style={styles.contactButtonText}>{contactBusyId === booking.id ? 'Loading contact…' : 'View guest phone'}</Text>
              </TouchableOpacity>
            )
          ) : <Text style={styles.contactLocked}>Guest contact unlocks after payment or confirmation.</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '800', color: '#17354B' },
  subtitle: { marginTop: -6, color: '#718397', fontSize: 12 },
  card: { padding: 15, gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  status: { color: '#087E8B', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  hotel: { fontSize: 16, fontWeight: '800', color: '#17354B' },
  meta: { color: '#64748B', fontSize: 12 },
  footer: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payment: { color: '#718397', fontSize: 11, textTransform: 'capitalize' },
  amount: { color: '#087E8B', fontSize: 15, fontWeight: '800' },
  voucher: { marginTop: 4, color: '#087E8B', fontSize: 12, fontWeight: '800' },
  actionButton: { alignSelf: 'flex-start', marginTop: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7, backgroundColor: '#087E8B' },
  actionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  noShowButton: { alignSelf: 'flex-start', marginTop: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7, backgroundColor: '#FEF3F2' },
  noShowText: { color: '#B42318', fontSize: 11, fontWeight: '800' },
  contactButton: { alignSelf: 'flex-start', marginTop: 7, paddingVertical: 8 },
  contactButtonText: { color: '#087E8B', fontSize: 12, fontWeight: '800' },
  contact: { marginTop: 7, color: '#17354B', fontSize: 12, fontWeight: '700' },
  contactLocked: { marginTop: 7, color: '#82909B', fontSize: 11 },
  state: { color: '#718397', paddingVertical: 16 },
  errorCard: { padding: 14, gap: 10, borderRadius: 11, backgroundColor: '#FFF7F6' },
  error: { color: '#A64339', fontSize: 12 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, backgroundColor: '#A84339' },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  empty: { alignItems: 'center', padding: 26, borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  emptyTitle: { color: '#17354B', fontSize: 15, fontWeight: '800' },
  emptyText: { color: '#718397', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
