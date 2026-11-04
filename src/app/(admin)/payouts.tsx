import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';

interface AdminPayout {
  id: string;
  hotel_id: string | null;
  booking_id: string | null;
  total_amount: number;
  amount: number | null;
  commission_amount: number;
  hotel_payout_amount: number;
  type: string;
  note: string | null;
  released_at: string | null;
  vendor_payout_status: 'pending' | 'eligible' | 'paid';
  created_at: string;
  hotels: { name: string } | null;
  bookings: { is_test: boolean } | null;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export default function AdminPayoutsScreen() {
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPayouts = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select('id, hotel_id, booking_id, total_amount, amount, commission_amount, hotel_payout_amount, type, note, released_at, vendor_payout_status, created_at, hotels(name), bookings(is_test)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setPayouts((data ?? []) as AdminPayout[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const markPayoutPaid = async (transactionId: string) => {
    setBusyId(transactionId);
    setError(null);
    const { error: updateError } = await supabase.rpc('admin_update_vendor_payout', {
      p_transaction_id: transactionId,
      p_status: 'paid',
    });
    if (updateError) {
      setError(updateError.message);
    } else {
      setPayouts((current) => current.map((payout) => payout.id === transactionId
        ? { ...payout, vendor_payout_status: 'paid' }
        : payout));
    }
    setBusyId(null);
  };

  useFocusEffect(useCallback(() => {
    void loadPayouts();
  }, [loadPayouts]));

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadPayouts(true)} />}
    >
      <Text style={styles.heading}>Payout history</Text>
      <Text style={styles.subtitle}>Booking commission and vendor shares from the platform transaction ledger.</Text>
      {loading ? <Text style={styles.state}>Loading payout records…</Text> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => void loadPayouts()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && payouts.length === 0 ? <Text style={styles.state}>No payout records found.</Text> : null}
      {payouts.map((payout) => (
        <View key={payout.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.id}>Booking {payout.booking_id?.slice(0, 8) ?? payout.id.slice(0, 8)}</Text>
            <Text style={styles.status}>{payout.vendor_payout_status.replaceAll('_', ' ')}</Text>
          </View>
          <Text style={styles.vendor}>{payout.hotels?.name ?? 'Deleted property'}</Text>
          {payout.bookings?.is_test ? <Text style={styles.testModeBadge}>TEST MODE · simulated earnings</Text> : null}
          <Text style={styles.amount}>{formatMoney(payout.total_amount)}</Text>
          <Text style={styles.meta}>
            Vendor share {formatMoney(payout.hotel_payout_amount)} · Commission {formatMoney(payout.commission_amount)}
          </Text>
          {payout.type === 'PAYOUT_RELEASE' && payout.note ? <Text style={styles.meta}>{payout.note}</Text> : null}
          <Text style={styles.meta}>Booking reference: {payout.booking_id?.slice(0, 8) ?? 'record retained'}</Text>
          <Text style={styles.meta}>{new Date(payout.released_at ?? payout.created_at).toLocaleDateString()}</Text>
          {payout.vendor_payout_status === 'eligible' && !payout.bookings?.is_test ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busyId === payout.id}
              style={[styles.markPaidButton, busyId === payout.id && styles.markPaidDisabled]}
              onPress={() => void markPayoutPaid(payout.id)}
            >
              <Text style={styles.markPaidText}>{busyId === payout.id ? 'Saving…' : 'Mark vendor transfer paid'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '800', color: '#17354B' },
  subtitle: { marginTop: -6, color: '#718397', fontSize: 12, lineHeight: 18 },
  card: { padding: 15, gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  id: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  status: { color: '#087E8B', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  testModeBadge: { alignSelf: 'flex-start', color: '#8A4B08', backgroundColor: '#FFF1CC', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, fontSize: 9, fontWeight: '900' },
  vendor: { marginTop: 3, color: '#17354B', fontSize: 15, fontWeight: '800' },
  amount: { color: '#17354B', fontSize: 19, fontWeight: '900' },
  meta: { color: '#718397', fontSize: 11 },
  state: { color: '#718397', paddingVertical: 16 },
  errorCard: { padding: 14, gap: 10, borderRadius: 11, backgroundColor: '#FFF7F6' },
  error: { color: '#A64339', fontSize: 12 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, backgroundColor: '#A84339' },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  markPaidButton: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7, backgroundColor: '#087E8B' },
  markPaidDisabled: { opacity: 0.6 },
  markPaidText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
