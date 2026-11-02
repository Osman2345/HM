import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { WithdrawalRequestRow } from '@/types/database';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const statusLabel = (status: WithdrawalRequestRow['status']) => status.charAt(0).toUpperCase() + status.slice(1);

export default function AdminWithdrawalsScreen() {
  const [requests, setRequests] = useState<WithdrawalRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRequests = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .order('requested_at', { ascending: false });
      if (fetchError) throw fetchError;
      setRequests((data ?? []) as WithdrawalRequestRow[]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load withdrawal requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const reviewWithdrawal = async (requestId: string, status: 'approved' | 'paid' | 'rejected') => {
    setBusyId(requestId);
    setError(null);

    try {
      const { error: reviewError } = await supabase.rpc('admin_review_withdrawal', {
        p_request_id: requestId,
        p_status: status,
        p_admin_note: null,
      });
      if (reviewError) throw reviewError;
      setRequests((current) => current.map((request) => request.id === requestId
        ? { ...request, status }
        : request));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update the withdrawal request.');
    } finally {
      setBusyId(null);
    }
  };

  useFocusEffect(useCallback(() => {
    void loadRequests();
  }, [loadRequests]));

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadRequests(true)} />}
    >
      <Text style={styles.heading}>Withdrawal requests</Text>
      <Text style={styles.subtitle}>Review manual mobile-money payouts requested by admins and vendors.</Text>

      {loading ? <Text style={styles.state}>Loading withdrawal requests…</Text> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => void loadRequests()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && requests.length === 0 ? <Text style={styles.state}>No withdrawal requests found.</Text> : null}

      {requests.map((request) => (
        <View key={request.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.id}>{request.requester_role === 'admin' ? 'Admin' : 'Vendor'} request</Text>
            <Text style={[styles.status, statusStyle(request.status)]}>{statusLabel(request.status)}</Text>
          </View>

          <Text style={styles.amount}>{formatMoney(request.amount)}</Text>
          <Text style={styles.meta}>{request.provider === 'orange_money' ? 'Orange Money' : 'AfriMoney'} · {request.phone_number}</Text>
          <Text style={styles.meta}>Requested {new Date(request.requested_at).toLocaleString()}</Text>
          <Text style={styles.meta}>Requester ID: {request.requester_id.slice(0, 8)}</Text>

          {request.status === 'pending' ? (
            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.primaryButton, busyId === request.id && styles.buttonDisabled]}
                disabled={busyId === request.id}
                onPress={() => void reviewWithdrawal(request.id, 'approved')}
              >
                <Text style={styles.primaryButtonText}>{busyId === request.id ? 'Saving…' : 'Approve'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.secondaryButton, busyId === request.id && styles.buttonDisabled]}
                disabled={busyId === request.id}
                onPress={() => void reviewWithdrawal(request.id, 'rejected')}
              >
                <Text style={styles.secondaryButtonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {request.status === 'approved' ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.primaryButton, busyId === request.id && styles.buttonDisabled]}
              disabled={busyId === request.id}
              onPress={() => void reviewWithdrawal(request.id, 'paid')}
            >
              <Text style={styles.primaryButtonText}>{busyId === request.id ? 'Saving…' : 'Mark paid'}</Text>
            </TouchableOpacity>
          ) : null}
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
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: '#087E8B' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  secondaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: '#E2E8F0' },
  secondaryButtonText: { color: '#17354B', fontSize: 11, fontWeight: '800' },
  state: { color: '#718397', paddingVertical: 16 },
  errorCard: { padding: 14, gap: 10, borderRadius: 11, backgroundColor: '#FFF7F6' },
  error: { color: '#A64339', fontSize: 12 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, backgroundColor: '#A84339' },
  retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  buttonDisabled: { opacity: 0.6 },
});
