import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { createPdfAndShare, downloadCsv } from '@/lib/reporting';
import { useAuthStore } from '@/store/auth.store';

interface VendorPayout {
  id: string;
  total_amount: number;
  commission_amount: number;
  hotel_payout_amount: number;
  status: string;
  vendor_payout_status: string;
  created_at: string;
  released_at: string | null;
  hotels: { name: string; owner_id: string } | null;
  bookings: { is_test: boolean } | null;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export default function VendorPayoutsScreen() {
  const userId = useAuthStore((state) => state.session?.user.id ?? null);
  const [payouts, setPayouts] = useState<VendorPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

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
      .from('transactions')
      .select('id, total_amount, commission_amount, hotel_payout_amount, status, vendor_payout_status, created_at, released_at, hotels!inner(name, owner_id), bookings(is_test)')
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

  const reportRows = payouts.map((payout) => [
    payout.id,
    payout.hotels?.name ?? 'Deleted property',
    payout.created_at,
    payout.released_at ?? '',
    payout.total_amount,
    payout.commission_amount,
    payout.hotel_payout_amount,
    payout.vendor_payout_status,
  ]);

  const exportCsv = () => {
    const downloaded = downloadCsv('vendor-payout-report.csv', [
      ['Payout ID', 'Property', 'Created at', 'Released at', 'Gross', 'Commission', 'Vendor payout', 'Status'],
      ...reportRows,
    ]);
    setExportMessage(downloaded ? 'CSV report downloaded.' : 'CSV download is available in the web app.');
  };

  const printReport = async () => {
    try {
      setExportMessage(null);
      await createPdfAndShare(
        'Vendor Payout Report',
        'All recorded payouts',
        [
          ['Gross', formatMoney(payouts.reduce((sum, payout) => sum + Number(payout.total_amount), 0))],
          ['Commission', formatMoney(payouts.reduce((sum, payout) => sum + Number(payout.commission_amount), 0))],
          ['Vendor share', formatMoney(payouts.reduce((sum, payout) => sum + Number(payout.hotel_payout_amount), 0))],
        ],
        [{ title: 'Payout transactions', headers: ['Payout ID', 'Property', 'Created', 'Released', 'Gross', 'Commission', 'Vendor payout', 'Status'], rows: reportRows }],
      );
    } catch (caughtError) {
      setExportMessage(caughtError instanceof Error ? caughtError.message : 'Unable to create the report.');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadPayouts(true)} />}
    >
      <Text style={styles.heading}>Payouts</Text>
      <Text style={styles.subtitle}>Payout records are retained for your financial history.</Text>
      <View style={styles.reportActions}>
        <TouchableOpacity accessibilityRole="button" style={styles.reportButton} onPress={exportCsv}><Text style={styles.reportButtonText}>Export CSV</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.reportButton} onPress={() => void printReport()}><Text style={styles.reportButtonText}>Print / PDF</Text></TouchableOpacity>
      </View>
      {exportMessage ? <Text style={styles.exportMessage}>{exportMessage}</Text> : null}
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
            <View style={styles.statusGroup}>
              {payout.bookings?.is_test ? <Text style={styles.testModeBadge}>TEST MODE</Text> : null}
              <Text style={styles.status}>
                {payout.status === 'released_test'
                  ? 'Released (TEST)'
                  : payout.bookings?.is_test && payout.vendor_payout_status === 'pending'
                    ? 'Pending (TEST)'
                    : payout.vendor_payout_status.replaceAll('_', ' ')}
              </Text>
            </View>
          </View>
          <Text style={styles.property}>{payout.hotels?.name ?? 'Deleted property'}</Text>
          <Text style={styles.amount}>{formatMoney(payout.hotel_payout_amount)}</Text>
          <Text style={styles.meta}>
              Gross {formatMoney(payout.total_amount)} · Commission {formatMoney(payout.commission_amount)}
          </Text>
          <Text style={styles.meta}>{payout.vendor_payout_status === 'eligible' ? 'Available after checkout; transfer is handled manually.' : payout.vendor_payout_status === 'paid' ? 'Transferred by the platform.' : 'Payout becomes eligible after checkout.'}</Text>
          <Text style={styles.meta}>{new Date(payout.released_at ?? payout.created_at).toLocaleDateString()}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '800', color: '#1F2937' },
  subtitle: { marginTop: -6, color: '#64748B', fontSize: 12 },
  reportActions: { flexDirection: 'row', gap: 8 },
  reportButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#4B5563' },
  reportButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  exportMessage: { color: '#64748B', fontSize: 11 },
  card: { padding: 15, gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  status: { color: '#4B5563', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  statusGroup: { alignItems: 'flex-end', gap: 4, maxWidth: '60%' },
  testModeBadge: { color: '#8A4B08', backgroundColor: '#FFF1CC', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, fontSize: 9, fontWeight: '900' },
  property: { color: '#1F2937', fontSize: 15, fontWeight: '800' },
  amount: { color: '#4B5563', fontSize: 19, fontWeight: '900' },
  meta: { color: '#64748B', fontSize: 11 },
  state: { color: '#64748B', paddingVertical: 16 },
  errorCard: { padding: 14, gap: 10, borderRadius: 11, backgroundColor: '#FFF7F6' },
  error: { color: '#A64339', fontSize: 12 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, backgroundColor: '#A84339' },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  empty: { alignItems: 'center', padding: 26, borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  emptyTitle: { color: '#1F2937', fontSize: 15, fontWeight: '800' },
  emptyText: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
