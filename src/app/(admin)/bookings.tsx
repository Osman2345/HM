import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { loadAdminBookings, type AdminBooking } from '@/services/admin';
import type { BookingStatus } from '@/types/database';
import TableRowSkeleton from '@/components/skeletons/TableRowSkeleton';
import useDelayedLoading from '@/hooks/useDelayedLoading';
import { releaseAdminTestBookingFunds, releaseAllAdminTestBookingFunds } from '@/lib/backend';
import { supabase } from '@/lib/supabase';

type BookingFilter = BookingStatus | 'all' | 'unpaid_commissions';
type VendorCommissionSummary = {
  vendor_id: string;
  commission_due: number;
  total_earnings: number;
  can_receive_bookings: boolean;
  users: { fullname: string | null; email: string } | null;
};
const filters: BookingFilter[] = ['pending', 'confirmed', 'checked_out', 'no_show', 'completed', 'cancelled', 'unpaid_commissions', 'all'];

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-SL', { style: 'currency', currency: 'SLL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0);

export default function AdminBookingsScreen() {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [vendorWallets, setVendorWallets] = useState<VendorCommissionSummary[]>([]);
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyBookingIds, setBusyBookingIds] = useState<string[]>([]);
  const [releasingAll, setReleasingAll] = useState(false);
  const showSkeleton = useDelayedLoading(loading);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [bookingRows, walletResponse] = await Promise.all([
        loadAdminBookings(filter),
        supabase
          .from('vendor_wallets')
          .select('vendor_id, commission_due, total_earnings, can_receive_bookings, users(fullname, email)')
          .order('commission_due', { ascending: false }),
      ]);
      if (walletResponse.error) throw walletResponse.error;
      setBookings(bookingRows);
      setVendorWallets((walletResponse.data ?? []) as VendorCommissionSummary[]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load bookings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  const releaseBooking = async (booking: AdminBooking) => {
    setBusyBookingIds((current) => [...current, booking.id]);
    setError(null);
    setNotice(null);
    try {
      const [release] = await releaseAdminTestBookingFunds(booking.id);
      if (!release) throw new Error('The server did not return the release details.');
      const recipient = release.vendorPhone || release.vendorName || release.vendorId;
      await refresh(true);
      setNotice(`Released ${formatMoney(release.amount)} to vendor ${recipient}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to release TEST funds.');
    } finally {
      setBusyBookingIds((current) => current.filter((id) => id !== booking.id));
    }
  };

  const releaseAllTestBookings = async () => {
    setReleasingAll(true);
    setError(null);
    setNotice(null);
    try {
      const releases = await releaseAllAdminTestBookingFunds();
      const total = releases.reduce((sum, release) => sum + Number(release.amount), 0);
      setNotice(
        releases.length === 0
          ? 'No paid pending TEST bookings are available to release.'
          : `Released ${releases.length} TEST booking(s), totaling ${formatMoney(total)}. Vendors: ${
            [...new Set(releases.map((release) => release.vendorPhone || release.vendorName || release.vendorId))].join(', ')
          }.`,
      );
      await refresh(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to release pending TEST funds.');
    } finally {
      setReleasingAll(false);
    }
  };

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
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.releaseAllButton, (releasingAll || busyBookingIds.length > 0) && styles.releaseButtonDisabled]}
        onPress={() => void releaseAllTestBookings()}
        disabled={releasingAll || busyBookingIds.length > 0}
      >
        {releasingAll ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
        <Text style={styles.releaseButtonText}>{releasingAll ? 'Releasing TEST funds…' : 'Release All TEST'}</Text>
      </TouchableOpacity>
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
              {item === 'all' ? 'All' : item === 'unpaid_commissions' ? 'Unpaid commissions' : item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading && showSkeleton ? <TableRowSkeleton /> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void refresh()}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      <View style={styles.walletPanel}>
        <Text style={styles.walletHeading}>Commission due per vendor</Text>
        {vendorWallets.filter((wallet) => Number(wallet.commission_due) > 0).length === 0 ? (
          <Text style={styles.meta}>No unpaid vendor commissions.</Text>
        ) : vendorWallets.filter((wallet) => Number(wallet.commission_due) > 0).map((wallet) => (
          <View key={wallet.vendor_id} style={styles.walletRow}>
            <Text style={styles.meta}>{wallet.users?.fullname ?? wallet.users?.email ?? wallet.vendor_id}</Text>
            <Text style={styles.walletDue}>{formatMoney(Number(wallet.commission_due))}</Text>
          </View>
        ))}
      </View>
      {!loading && !error && bookings.length === 0 ? <Text style={styles.state}>No bookings match this filter.</Text> : null}
      {!(loading && showSkeleton) ? bookings.map((booking) => (
        <View key={booking.id} style={styles.card}>
          <View style={styles.headingRow}>
            <Text style={styles.id}>Booking {booking.id.slice(0, 8)}</Text>
            {booking.is_test || Number(booking.total_price) === 1
              ? <Text style={styles.testBadge}>TEST</Text>
              : null}
          </View>
          <Text style={styles.title}>{booking.hotels?.name ?? 'Hotel unavailable'}</Text>
          <Text style={styles.meta}>Guest: {booking.users?.fullname ?? booking.users?.email ?? 'Deleted account'}</Text>
          <Text style={styles.meta}>Stay: {booking.check_in} to {booking.check_out}</Text>
          <Text style={styles.meta}>{booking.guests} guests · {booking.rooms} room(s)</Text>
          <Text style={styles.meta}>
            Booking: {booking.booking_status === 'completed' && booking.is_test
              ? 'Completed (TEST)'
              : booking.transaction?.status === 'pending_test'
                ? 'Pending (TEST)'
                : booking.booking_status}
            {' · '}Payment: {booking.payment_status}
          </Text>
          <Text style={styles.amount}>{formatMoney(booking.total_price)}</Text>
          <Text style={styles.meta}>Commission: {formatMoney(booking.commission)} · {booking.commission_status}</Text>
          {booking.is_test
            && booking.payment_method !== 'pay_at_hotel'
            && booking.booking_status !== 'completed'
            && (
              booking.booking_status === 'pending'
              || booking.transaction?.status === 'pending_test'
              || booking.transaction?.vendor_payout_status === 'pending'
            ) ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.releaseButton, (busyBookingIds.includes(booking.id) || releasingAll || booking.payment_status !== 'paid') && styles.releaseButtonDisabled]}
              onPress={() => void releaseBooking(booking)}
              disabled={busyBookingIds.includes(booking.id) || releasingAll || booking.payment_status !== 'paid'}
            >
              {busyBookingIds.includes(booking.id) ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={styles.releaseButtonText}>
                {busyBookingIds.includes(booking.id)
                  ? 'Releasing…'
                  : booking.payment_status === 'paid' ? 'Release Funds' : 'Awaiting TEST PIN'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  testBadge: { backgroundColor: '#FEF3C7', color: '#92400E', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, fontSize: 10, fontWeight: '900' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#E2E8F0' },
  filterSelected: { backgroundColor: '#1D4ED8' },
  filterText: { color: '#334155', textTransform: 'capitalize', fontWeight: '600' },
  filterTextSelected: { color: '#FFFFFF' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C' },
  notice: { color: '#166534', backgroundColor: '#DCFCE7', borderRadius: 10, padding: 12, fontWeight: '700' },
  walletPanel: { gap: 8, padding: 14, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  walletHeading: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  walletRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  walletDue: { color: '#B42318', fontWeight: '800' },
  card: { padding: 14, gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12 },
  id: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  meta: { color: '#475569' },
  amount: { marginTop: 4, color: '#1D4ED8', fontWeight: '700', fontSize: 18 },
  button: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1D4ED8' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  releaseAllButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, paddingHorizontal: 14, borderRadius: 9, backgroundColor: '#15803D' },
  releaseButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#15803D' },
  releaseButtonDisabled: { opacity: 0.6 },
  releaseButtonText: { color: '#FFFFFF', fontWeight: '800' },
});
