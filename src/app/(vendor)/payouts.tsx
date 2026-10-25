import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';

interface VendorPayout {
  id: string;
  amount: number;
  commission: number;
  hotel_share: number;
  status: string;
  created_at: string;
  hotels: { name: string; owner_id: string } | null;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export default function VendorPayoutsScreen() {
  const userId = useAuthStore((state) => state.session?.user.id ?? null);
  const [payouts, setPayouts] = useState<VendorPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPayouts = useCallback(async (pull = false) => {
    if (!userId) {
      setPayouts([]);
      setError('Sign in again to view your payout history.');
      setLoading(false);
      return;
    }
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('payouts')
      .select('id, amount, commission, hotel_share, status, created_at, hotels!inner(name, owner_id)')
      .eq('hotels.owner_id', userId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setPayouts((data ?? []) as VendorPayout[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadPayouts();
  }, [loadPayouts]));

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadPayouts(true)} />}
    >
      <Text style={styles.heading}>Payouts</Text>
      <Text style={styles.subtitle}>Payout records are retained for your financial history.</Text>
      {loading ? <Text style={styles.state}>Loading payouts…</Text> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => void loadPayouts()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && payouts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No payouts recorded</Text>
          <Text style={styles.emptyText}>When payout records are created for your properties, they will appear here.</Text>
        </View>
      ) : null}
      {payouts.map((payout) => (
        <View key={payout.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.id}>Payout {payout.id.slice(0, 8)}</Text>
            <Text style={styles.status}>{payout.status}</Text>
          </View>
          <Text style={styles.property}>{payout.hotels?.name ?? 'Deleted property'}</Text>
          <Text style={styles.amount}>{formatMoney(payout.hotel_share)}</Text>
          <Text style={styles.meta}>
            Gross {formatMoney(payout.amount)} · Commission {formatMoney(payout.commission)}
          </Text>
          <Text style={styles.meta}>{new Date(payout.created_at).toLocaleDateString()}</Text>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  status: { color: '#087E8B', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  property: { color: '#17354B', fontSize: 15, fontWeight: '800' },
  amount: { color: '#087E8B', fontSize: 19, fontWeight: '900' },
  meta: { color: '#718397', fontSize: 11 },
  state: { color: '#718397', paddingVertical: 16 },
  errorCard: { padding: 14, gap: 10, borderRadius: 11, backgroundColor: '#FFF7F6' },
  error: { color: '#A64339', fontSize: 12 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, backgroundColor: '#A84339' },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  empty: { alignItems: 'center', padding: 26, borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  emptyTitle: { color: '#17354B', fontSize: 15, fontWeight: '800' },
  emptyText: { color: '#718397', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
