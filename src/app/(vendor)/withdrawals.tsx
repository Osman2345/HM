import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '@/store/auth.store';
import { supabase } from '@/lib/supabase';
import type { WithdrawalRequestRow } from '@/types/database';
import { createPdfAndShare, downloadCsv, withdrawalStatusLabel } from '@/lib/reporting';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const statusLabel = (status: WithdrawalRequestRow['status'] | 'all') => withdrawalStatusLabel(status);

export default function VendorWithdrawalsScreen() {
  const userId = useAuthStore((state) => state.session?.user.id ?? null);
  const [requests, setRequests] = useState<WithdrawalRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | WithdrawalRequestRow['status']>('all');

  const loadRequests = useCallback(async (pull = false) => {
    if (!userId) {
      setRequests([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('requester_id', userId)
        .order('requested_at', { ascending: false });
      if (fetchError) throw fetchError;
      setRequests((data ?? []) as WithdrawalRequestRow[]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load withdrawal requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadRequests();
  }, [loadRequests]));

  const filteredRequests = statusFilter === 'all' ? requests : requests.filter((request) => request.status === statusFilter);
  const reportRows = filteredRequests.map((request) => [
    request.id,
    request.requested_at,
    request.reviewed_at ?? '',
    request.paid_at ?? '',
    request.amount,
    0,
    request.amount,
    request.provider,
    request.phone_number,
    withdrawalStatusLabel(request.status),
    request.admin_note ?? '',
  ]);

  const exportCsv = () => {
    const downloaded = downloadCsv('vendor-withdrawal-report.csv', [
      ['Request ID', 'Requested at', 'Reviewed at', 'Withdrawn at', 'Requested amount', 'Fees', 'Amount withdrawn', 'Provider', 'Phone', 'Status', 'Admin note'],
      ...reportRows,
    ]);
    setExportMessage(downloaded ? 'CSV report downloaded.' : 'CSV download is available in the web app.');
  };

  const printReport = async () => {
    try {
      setExportMessage(null);
      await createPdfAndShare(
        'Vendor Withdrawal Report',
        statusFilter === 'all' ? 'All statuses' : `Status: ${statusLabel(statusFilter)}`,
        [
          ['Requested', formatMoney(filteredRequests.reduce((sum, request) => sum + Number(request.amount), 0))],
          ['Withdrawn', formatMoney(filteredRequests.filter((request) => request.status === 'paid').reduce((sum, request) => sum + Number(request.amount), 0))],
          ['Requests', filteredRequests.length],
        ],
        [{ title: 'Withdrawal transactions', headers: ['Request ID', 'Requested', 'Reviewed', 'Withdrawn', 'Amount', 'Fees', 'Net', 'Provider', 'Phone', 'Status', 'Admin note'], rows: reportRows }],
      );
    } catch (caughtError) {
      setExportMessage(caughtError instanceof Error ? caughtError.message : 'Unable to create the report.');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadRequests(true)} />}
    >
      <Text style={styles.heading}>My withdrawals</Text>
      <Text style={styles.subtitle}>Track the status of your mobile-money withdrawal requests.</Text>
      <View style={styles.filters}>
        {(['all', 'pending', 'approved', 'paid', 'rejected'] as const).map((status) => (
          <TouchableOpacity key={status} accessibilityRole="button" style={[styles.filter, statusFilter === status && styles.filterSelected]} onPress={() => setStatusFilter(status)}>
            <Text style={[styles.filterText, statusFilter === status && styles.filterTextSelected]}>{status === 'all' ? 'All' : statusLabel(status)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.reportActions}>
        <TouchableOpacity accessibilityRole="button" style={styles.reportButton} onPress={exportCsv}><Text style={styles.reportButtonText}>Export CSV</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.reportButton} onPress={() => void printReport()}><Text style={styles.reportButtonText}>Print / PDF</Text></TouchableOpacity>
      </View>
      {exportMessage ? <Text style={styles.exportMessage}>{exportMessage}</Text> : null}

      {loading ? <Text style={styles.state}>Loading withdrawals…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && requests.length === 0 ? <Text style={styles.state}>No withdrawal requests yet.</Text> : null}

      {filteredRequests.map((request) => (
        <View key={request.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.id}>Request {request.id.slice(0, 8)}</Text>
            <Text style={[styles.status, statusStyle(request.status)]}>{statusLabel(request.status)}</Text>
          </View>
          <Text style={styles.amount}>{formatMoney(request.amount)}</Text>
          <Text style={styles.meta}>{request.provider === 'orange_money' ? 'Orange Money' : 'AfriMoney'} · {request.phone_number}</Text>
          <Text style={styles.meta}>Requested {new Date(request.requested_at).toLocaleString()}</Text>
          {request.reviewed_at ? <Text style={styles.meta}>Reviewed {new Date(request.reviewed_at).toLocaleString()}</Text> : null}
          {request.paid_at ? <Text style={styles.meta}>Withdrawn {new Date(request.paid_at).toLocaleString()}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const statusStyle = (status: WithdrawalRequestRow['status']) => {
  switch (status) {
    case 'pending':
      return { color: '#C47A2C', backgroundColor: '#FFF3E5' };
    case 'approved':
      return { color: '#4B5563', backgroundColor: '#F3F4F6' };
    case 'paid':
      return { color: '#1F7A5A', backgroundColor: '#EAFBF5' };
    case 'rejected':
      return { color: '#B42318', backgroundColor: '#FDECEC' };
    default:
      return { color: '#64748B', backgroundColor: '#EEF2F7' };
  }
};

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '800', color: '#1F2937' },
  subtitle: { marginTop: -6, color: '#64748B', fontSize: 12, lineHeight: 18 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#E2E8F0' },
  filterSelected: { backgroundColor: '#4B5563' },
  filterText: { color: '#334155', fontSize: 10, fontWeight: '800' },
  filterTextSelected: { color: '#FFFFFF' },
  reportActions: { flexDirection: 'row', gap: 8 },
  reportButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#4B5563' },
  reportButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  exportMessage: { color: '#64748B', fontSize: 11 },
  card: { padding: 15, gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  id: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  status: { fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  amount: { color: '#1F2937', fontSize: 19, fontWeight: '900' },
  meta: { color: '#64748B', fontSize: 11 },
  state: { color: '#64748B', paddingVertical: 16 },
  error: { color: '#A64339', fontSize: 12 },
});
