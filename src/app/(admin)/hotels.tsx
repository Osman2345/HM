import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { loadAdminHotels, reviewAdminHotel, type AdminHotel } from '@/services/admin';
import { AdminTable, AdminTableCell, AdminTableHeader, AdminTableRow, adminTableText } from '@/components/admin/AdminTable';
import type { HotelApprovalStatus } from '@/types/database';

type HotelFilter = HotelApprovalStatus | 'all';
const filters: HotelFilter[] = ['pending', 'approved', 'rejected', 'all'];

export default function AdminHotelsScreen() {
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [filter, setFilter] = useState<HotelFilter>('pending');
  const [search, setSearch] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setHotels(await loadAdminHotels(filter));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load hotel listings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeout);
  }, [refresh]);

  const performReview = async (
    hotel: AdminHotel,
    status: HotelApprovalStatus | null,
    featured: boolean | null,
  ) => {
    const reason = reasons[hotel.id]?.trim() ?? '';
    if (status === 'rejected' && !reason) {
      setError('Enter a rejection reason before rejecting a hotel.');
      return;
    }
    setBusyId(hotel.id);
    setError(null);
    try {
      await reviewAdminHotel(hotel.id, status, status === 'rejected' ? reason : null, featured);
      await refresh(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update this hotel.');
    } finally {
      setBusyId(null);
    }
  };

  const visibleHotels = hotels.filter((hotel) => {
    const searchTerm = search.trim().toLowerCase();
    return !searchTerm || [hotel.name, hotel.location, hotel.city, hotel.country, hotel.owner_id]
      .some((value) => value?.toLowerCase().includes(searchTerm));
  });

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <View style={styles.pageHeading}>
        <View><Text style={styles.heading}>Hotel management</Text><Text style={styles.subtitle}>{visibleHotels.length} matching properties</Text></View>
      </View>
      <TextInput
        accessibilityLabel="Search hotels"
        value={search}
        onChangeText={setSearch}
        placeholder="Search property, location or owner ID"
        autoCapitalize="none"
        style={styles.search}
      />
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
      {loading ? <Text style={styles.state}>Loading hotels…</Text> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.smallButton} onPress={() => void refresh()}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && visibleHotels.length === 0 ? <Text style={styles.state}>No properties match these filters.</Text> : null}
      {!loading && !error && visibleHotels.length ? (
        <AdminTable minWidth={1190}>
          <AdminTableHeader>
            <AdminTableCell width={260}><Text style={adminTableText.header}>Property</Text></AdminTableCell>
            <AdminTableCell width={230}><Text style={adminTableText.header}>Location</Text></AdminTableCell>
            <AdminTableCell width={120}><Text style={adminTableText.header}>Owner</Text></AdminTableCell>
            <AdminTableCell width={120}><Text style={adminTableText.header}>Rating</Text></AdminTableCell>
            <AdminTableCell width={110}><Text style={adminTableText.header}>Status</Text></AdminTableCell>
            <AdminTableCell width={350}><Text style={adminTableText.header}>Manage</Text></AdminTableCell>
          </AdminTableHeader>
          {visibleHotels.map((hotel) => (
            <AdminTableRow key={hotel.id}>
              <AdminTableCell width={260}>
                <Text numberOfLines={1} style={adminTableText.primary}>{hotel.name}</Text>
                <Text style={adminTableText.secondary}>{hotel.rooms?.length ?? 0} room types</Text>
              </AdminTableCell>
              <AdminTableCell width={230}>
                <Text numberOfLines={1} style={adminTableText.primary}>{hotel.city}, {hotel.country}</Text>
                <Text numberOfLines={1} style={adminTableText.secondary}>{hotel.location}</Text>
              </AdminTableCell>
              <AdminTableCell width={120}><Text numberOfLines={1} style={adminTableText.muted}>{hotel.owner_id?.slice(0, 8) ?? 'Unassigned'}</Text></AdminTableCell>
              <AdminTableCell width={120}><Text style={adminTableText.primary}>{Number(hotel.rating).toFixed(1)} · {hotel.review_count}</Text></AdminTableCell>
              <AdminTableCell width={110}>
                <Text style={[styles.statusBadge, hotel.approval_status === 'approved' ? styles.statusApproved : hotel.approval_status === 'rejected' ? styles.statusRejected : styles.statusPending]}>{hotel.approval_status}</Text>
                {hotel.featured ? <Text style={styles.featuredLabel}>Featured</Text> : null}
              </AdminTableCell>
              <AdminTableCell width={350}>
                <View style={styles.rowActions}>
                  {hotel.approval_status !== 'approved' ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={busyId === hotel.id}
                      style={[styles.smallAction, styles.approveAction, busyId === hotel.id && styles.actionDisabled]}
                      onPress={() => void performReview(hotel, 'approved', null)}
                    ><Text style={styles.approveText}>{busyId === hotel.id ? 'Saving…' : 'Approve'}</Text></TouchableOpacity>
                  ) : null}
                  {hotel.approval_status !== 'rejected' ? (
                    <>
                      <TextInput
                        accessibilityLabel={`Rejection reason for ${hotel.name}`}
                        value={reasons[hotel.id] ?? ''}
                        onChangeText={(value) => setReasons((current) => ({ ...current, [hotel.id]: value }))}
                        placeholder="Reason to reject"
                        style={styles.reasonInput}
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={busyId === hotel.id}
                        style={[styles.smallAction, styles.rejectAction]}
                        onPress={() => void performReview(hotel, 'rejected', null)}
                      ><Text style={styles.rejectText}>Reject</Text></TouchableOpacity>
                    </>
                  ) : null}
                  {hotel.approval_status === 'approved' ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={busyId === hotel.id}
                      style={styles.smallAction}
                      onPress={() => void performReview(hotel, null, !hotel.featured)}
                    ><Text style={styles.smallActionText}>{hotel.featured ? 'Unfeature' : 'Feature'}</Text></TouchableOpacity>
                  ) : null}
                </View>
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </AdminTable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 36, gap: 14 },
  pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 23, fontWeight: '800', color: '#17354B' },
  subtitle: { marginTop: 4, color: '#718397', fontSize: 12 },
  search: { minHeight: 42, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', color: '#17354B' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: '#DDE6E9', borderRadius: 6, backgroundColor: '#FFFFFF' },
  filterSelected: { borderColor: '#087E8B', backgroundColor: '#E8F5F3' },
  filterText: { color: '#526974', fontSize: 11, textTransform: 'capitalize', fontWeight: '600' },
  filterTextSelected: { color: '#087E8B', fontWeight: '800' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 7, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C', fontSize: 12 },
  smallButton: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: '#087E8B' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  statusApproved: { color: '#027A48', backgroundColor: '#ECFDF3' },
  statusPending: { color: '#B54708', backgroundColor: '#FFFAEB' },
  statusRejected: { color: '#B42318', backgroundColor: '#FEF3F2' },
  featuredLabel: { marginTop: 4, color: '#087E8B', fontSize: 9, fontWeight: '800' },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  smallAction: { minHeight: 27, justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: '#B9DCDD', borderRadius: 5, backgroundColor: '#FFFFFF' },
  smallActionText: { color: '#087E8B', fontSize: 10, fontWeight: '700' },
  approveAction: { borderColor: '#A6F4C5', backgroundColor: '#ECFDF3' },
  approveText: { color: '#027A48', fontSize: 10, fontWeight: '800' },
  rejectAction: { borderColor: '#FECACA', backgroundColor: '#FEF3F2' },
  rejectText: { color: '#B42318', fontSize: 10, fontWeight: '800' },
  actionDisabled: { opacity: 0.55 },
  reasonInput: { width: 140, minHeight: 30, paddingHorizontal: 7, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 5, color: '#17354B', fontSize: 10 },
});
