import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { loadAdminReport, type AdminReport } from '@/services/admin';
import { createPdfAndShare, downloadCsv, withdrawalStatusLabel } from '@/lib/reporting';

const periods = [30, 90, 365] as const;
type Period = (typeof periods)[number];

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-SL', { style: 'currency', currency: 'SLL', maximumFractionDigits: 0 }).format(Number(amount) || 0);

const withdrawalStatusStyle = (status: 'pending' | 'approved' | 'paid' | 'rejected') => {
  switch (status) {
    case 'paid':
      return { color: '#1F7A5A', backgroundColor: '#EAFBF5' };
    case 'approved':
      return { color: '#4B5563', backgroundColor: '#F3F4F6' };
    case 'rejected':
      return { color: '#B42318', backgroundColor: '#FDECEC' };
    default:
      return { color: '#C47A2C', backgroundColor: '#FFF3E5' };
  }
};

export default function AdminReportsScreen() {
  const [period, setPeriod] = useState<Period>(30);
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setReport(await loadAdminReport(period));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeout);
  }, [refresh]);

  const chart = useMemo(() => {
    if (!report) return [];
    const count = period === 365 ? 12 : 6;
    const buckets = Array.from({ length: count }, (_, index) => ({ label: String(index + 1), value: 0 }));
    const periodEnd = Date.parse(report.periodEnd);
    report.bookings.forEach((booking) => {
      const elapsed = periodEnd - Date.parse(booking.created_at);
      const index = Math.min(count - 1, Math.floor((elapsed / (period * 24 * 60 * 60 * 1000)) * count));
      if (index >= 0) buckets[count - 1 - index].value += 1;
    });
    return buckets;
  }, [period, report]);

  const exportCsv = () => {
    if (!report) return;
    const content = [
      ['Report period (days)', period],
      ['Revenue', report.revenue],
      ['Commission', report.commission],
      ['New users', report.newUsers],
      [],
      ['Transaction report'],
      ['Transaction ID', 'Booking ID', 'Vendor ID', 'Gross', 'Commission', 'Vendor payout', 'Payout status', 'Status', 'Created at', 'Released at'],
      ...report.transactions.map((transaction) => [
        transaction.id,
        transaction.booking_id,
        transaction.vendor_id,
        transaction.total_amount,
        transaction.commission_amount,
        transaction.hotel_payout_amount,
        transaction.vendor_payout_status,
        transaction.status,
        transaction.created_at,
        transaction.released_at ?? '',
      ]),
      [],
      ['Withdrawal report'],
      ['Request ID', 'Requester role', 'Requester ID', 'Requested amount', 'Provider', 'Phone', 'Status', 'Requested at', 'Reviewed at', 'Withdrawn at', 'Admin note'],
      ...report.withdrawals.map((withdrawal) => [
        withdrawal.id,
        withdrawal.requester_role,
        withdrawal.requester_id,
        withdrawal.amount,
        withdrawal.provider,
        withdrawal.phone_number,
        withdrawalStatusLabel(withdrawal.status),
        withdrawal.requested_at,
        withdrawal.reviewed_at ?? '',
        withdrawal.paid_at ?? '',
        withdrawal.admin_note ?? '',
      ]),
      [],
      ['Top hotels'],
      ['Hotel', 'Bookings', 'Paid booking revenue'],
      ...report.topHotels.map((hotel) => [hotel.name, hotel.bookings, hotel.revenue]),
    ];
    const downloaded = downloadCsv(`hotel-admin-report-${period}-days.csv`, content);
    setExportMessage(downloaded ? 'CSV report downloaded.' : 'CSV download is available in the web app.');
  };

  const printReport = async () => {
    if (!report) return;
    try {
      setExportMessage(null);
      await createPdfAndShare(
        'Admin Financial Report',
        `${period} day report`,
        [
          ['Revenue', formatMoney(report.revenue)],
          ['Commission', formatMoney(report.commission)],
          ['Vendor payouts', formatMoney(report.transactions.reduce((sum, transaction) => sum + Number(transaction.hotel_payout_amount), 0))],
          ['Withdrawals', formatMoney(report.withdrawals.reduce((sum, withdrawal) => sum + Number(withdrawal.amount), 0))],
        ],
        [
          {
            title: 'Money transactions',
            headers: ['Transaction ID', 'Vendor ID', 'Gross', 'Commission', 'Vendor payout', 'Status', 'Created'],
            rows: report.transactions.map((transaction) => [
              transaction.id,
              transaction.vendor_id,
              transaction.total_amount,
              transaction.commission_amount,
              transaction.hotel_payout_amount,
              transaction.vendor_payout_status,
              transaction.created_at,
            ]),
          },
          {
            title: 'Withdrawal transactions',
            headers: ['Request ID', 'Role', 'Requester', 'Amount', 'Provider', 'Status', 'Requested', 'Withdrawn'],
            rows: report.withdrawals.map((withdrawal) => [
              withdrawal.id,
              withdrawal.requester_role,
              withdrawal.requester_id,
              withdrawal.amount,
              withdrawal.provider,
              withdrawalStatusLabel(withdrawal.status),
              withdrawal.requested_at,
              withdrawal.paid_at ?? '',
            ]),
          },
        ],
      );
    } catch (caughtError) {
      setExportMessage(caughtError instanceof Error ? caughtError.message : 'Unable to create the report.');
    }
  };

  const maxCount = Math.max(1, ...chart.map((bucket) => bucket.value));

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <Text style={styles.heading}>Reports</Text>
      <View style={styles.periods}>
        {periods.map((days) => (
          <TouchableOpacity
            key={days}
            accessibilityRole="button"
            accessibilityState={{ selected: period === days }}
            style={[styles.period, period === days && styles.periodSelected]}
            onPress={() => setPeriod(days)}
          >
            <Text style={[styles.periodText, period === days && styles.periodTextSelected]}>
              {days === 365 ? '12 months' : `${days} days`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <Text style={styles.state}>Loading reports…</Text> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.exportButton} onPress={() => void refresh()}>
            <Text style={styles.exportText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {report ? (
        <>
          <View style={styles.metricGrid}>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{report.bookings.length}</Text><Text style={styles.metricLabel}>Bookings</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{formatMoney(report.revenue)}</Text><Text style={styles.metricLabel}>Revenue</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{formatMoney(report.commission)}</Text><Text style={styles.metricLabel}>Commission</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{report.newUsers}</Text><Text style={styles.metricLabel}>New users</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{report.withdrawals.length}</Text><Text style={styles.metricLabel}>Withdrawals</Text></View>
            <View style={styles.metricCard}><Text style={styles.metricValue}>{formatMoney(report.withdrawals.reduce((sum, withdrawal) => sum + Number(withdrawal.amount), 0))}</Text><Text style={styles.metricLabel}>Withdrawal amount</Text></View>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Bookings across the selected period</Text>
            {report.bookings.length === 0 ? (
              <Text style={styles.meta}>No bookings in this period.</Text>
            ) : (
              <View style={styles.barRow}>
                {chart.map((bucket) => (
                  <View key={bucket.label} style={styles.barGroup}>
                    <Text style={styles.barValue}>{bucket.value || ''}</Text>
                    <View style={[styles.bar, { height: Math.max(4, (bucket.value / maxCount) * 100) }]} />
                    <Text style={styles.barLabel}>{bucket.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Top hotels</Text>
            {report.topHotels.length === 0 ? (
              <Text style={styles.meta}>No hotel activity in this period.</Text>
            ) : (
              report.topHotels.map((hotel) => (
                <View key={hotel.name} style={styles.hotelRow}>
                  <View style={styles.hotelText}>
                    <Text style={styles.hotelName}>{hotel.name}</Text>
                    <Text style={styles.meta}>{hotel.bookings} bookings · {formatMoney(hotel.revenue)} paid revenue</Text>
                  </View>
                </View>
              ))
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Withdrawals</Text>
            {report.withdrawals.length === 0 ? (
              <Text style={styles.meta}>No withdrawal requests in this period.</Text>
            ) : (
              report.withdrawals.map((withdrawal) => (
                <View key={withdrawal.id} style={styles.withdrawalRow}>
                  <View style={styles.withdrawalCopy}>
                    <Text style={styles.withdrawalTitle}>
                      {withdrawal.requester_role === 'vendor' ? 'Vendor' : 'Admin'} withdrawal
                    </Text>
                    <Text style={styles.meta}>
                      {withdrawal.provider === 'orange_money' ? 'Orange Money' : 'AfriMoney'} · {withdrawal.phone_number}
                    </Text>
                    <Text style={styles.meta}>Requested {new Date(withdrawal.requested_at).toLocaleString()}</Text>
                    {withdrawal.reviewed_at ? (
                      <Text style={styles.meta}>Reviewed {new Date(withdrawal.reviewed_at).toLocaleString()}</Text>
                    ) : null}
                    {withdrawal.paid_at ? (
                      <Text style={styles.meta}>Withdrawn {new Date(withdrawal.paid_at).toLocaleString()}</Text>
                    ) : null}
                    {withdrawal.admin_note ? (
                      <Text style={styles.meta}>Note: {withdrawal.admin_note}</Text>
                    ) : null}
                  </View>
                  <View style={styles.withdrawalAmount}>
                    <Text style={styles.withdrawalValue}>{formatMoney(withdrawal.amount)}</Text>
                    <Text style={[styles.withdrawalStatus, withdrawalStatusStyle(withdrawal.status)]}>
                      {withdrawalStatusLabel(withdrawal.status)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
          <TouchableOpacity accessibilityRole="button" style={styles.exportButton} onPress={exportCsv}>
            <Text style={styles.exportText}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.exportButton} onPress={() => void printReport()}>
            <Text style={styles.exportText}>Print / PDF</Text>
          </TouchableOpacity>
          {exportMessage ? <Text accessibilityLiveRegion="polite" style={styles.meta}>{exportMessage}</Text> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  heading: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  periods: { flexDirection: 'row', gap: 8 },
  period: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E2E8F0' },
  periodSelected: { backgroundColor: '#374151' },
  periodText: { color: '#334155', fontWeight: '600' },
  periodTextSelected: { color: '#FFFFFF' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: '46%', padding: 14, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#FFFFFF' },
  metricValue: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  metricLabel: { marginTop: 6, color: '#475569' },
  card: { padding: 16, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#FFFFFF' },
  sectionTitle: { marginBottom: 12, fontSize: 18, fontWeight: '700', color: '#0F172A' },
  meta: { color: '#475569' },
  barRow: { height: 150, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  barGroup: { flex: 1, height: 140, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { color: '#475569', fontSize: 11, marginBottom: 4 },
  bar: { width: '70%', maxWidth: 32, backgroundColor: '#4B5563', borderRadius: 6 },
  barLabel: { color: '#64748B', fontSize: 11, marginTop: 4 },
  hotelRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  hotelText: { gap: 4 },
  hotelName: { fontWeight: '700', color: '#0F172A' },
  withdrawalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  withdrawalCopy: { flex: 1, gap: 3 },
  withdrawalTitle: { fontWeight: '800', color: '#0F172A' },
  withdrawalAmount: { alignItems: 'flex-end', gap: 6 },
  withdrawalValue: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  withdrawalStatus: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 10, fontWeight: '800' },
  exportButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#374151' },
  exportText: { color: '#FFFFFF', fontWeight: '700' },
});
