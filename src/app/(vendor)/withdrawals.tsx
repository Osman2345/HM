import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '@/store/auth.store';
import { supabase } from '@/lib/supabase';
import type { WithdrawalRequestRow } from '@/types/database';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const statusLabel = (status: WithdrawalRequestRow['status']) => status.charAt(0).toUpperCase() + status.slice(1);

export default function VendorWithdrawalsScreen() {
  const userId = useAuthStore((state) => state.session?.user.id ?? null);
  const [requests, setRequests] = useState<WithdrawalRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadRequests(true)} />}
    >
      <Text style={styles.heading}>My withdrawals</Text>
      <Text style={styles.subtitle}>Track the status of your mobile-money withdrawal requests.</Text>

      {loading ? <Text style={styles.state}>Loading withdrawals…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && requests.length === 0 ? <Text style={styles.state}>No withdrawal requests yet.</Text> : null}

      {requests.map((request) => (
        <View key={request.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.id}>Request {request.id.slice(0, 8)}</Text>
            <Text style={[styles.status, statusStyle(request.status)]}>{statusLabel(request.status)}</Text>
          </View>
          <Text style={styles.amount}>{formatMoney(request.amount)}</Text>
          <Text style={styles.meta}>{request.provider === 'orange_money' ? 'Orange Money' : 'AfriMoney'} · {request.phone_number}</Text>
          <Text style={styles.meta}>Requested {new Date(request.requested_at).toLocaleString()}</Text>
          {request.reviewed_at ? <Text style={styles.meta}>Reviewed {new Date(request.reviewed_at).toLocaleString()}</Text> : null}
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
      return { color: '#087E8B', backgroundColor: '#E8F5F3' };
    case 'paid':
      return { color: '#1F7A5A', backgroundColor: '#EAFBF5' };
    case 'rejected':
      return { color: '#B42318', backgroundColor: '#FDECEC' };
    default:
      return { color: '#526974', backgroundColor: '#EEF2F7' };
  }
};

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '800', color: '#17354B' },
  subtitle: { marginTop: -6, color: '#718397', fontSize: 12, lineHeight: 18 },
  card: { padding: 15, gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  id: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  status: { fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  amount: { color: '#17354B', fontSize: 19, fontWeight: '900' },
  meta: { color: '#718397', fontSize: 11 },
  state: { color: '#718397', paddingVertical: 16 },
  error: { color: '#A64339', fontSize: 12 },
});
