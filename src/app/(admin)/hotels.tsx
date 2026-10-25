import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { loadAdminHotels, reviewAdminHotel, type AdminHotel } from '@/services/admin';
import type { HotelApprovalStatus } from '@/types/database';

type HotelFilter = HotelApprovalStatus | 'all';
const filters: HotelFilter[] = ['pending', 'approved', 'rejected', 'all'];

export default function AdminHotelsScreen() {
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [filter, setFilter] = useState<HotelFilter>('pending');
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <Text style={styles.heading}>Hotel listing management</Text>
      <Text style={styles.meta}>
        Properties from approved vendors publish immediately. Use this area for optional moderation and featuring.
      </Text>
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
      {!loading && !error && hotels.length === 0 ? <Text style={styles.state}>No hotels match this status.</Text> : null}
      {hotels.map((hotel) => (
        <View key={hotel.id} style={styles.card}>
          <Text style={styles.name}>{hotel.name}</Text>
          <Text style={styles.meta}>{hotel.location} · {hotel.city}, {hotel.country}</Text>
          <Text style={styles.meta}>Status: {hotel.approval_status} · Rating: {Number(hotel.rating).toFixed(1)} ({hotel.review_count})</Text>
          <Text style={styles.description}>{hotel.description}</Text>
          <Text style={styles.meta}>Amenities: {hotel.amenities?.length ? hotel.amenities.join(', ') : 'None listed'}</Text>
          <Text style={styles.meta}>Owner account: {hotel.owner_id ?? 'Unassigned'}</Text>
          <Text style={styles.meta}>Check-in: {hotel.check_in_time ?? 'Not specified'} · Check-out: {hotel.check_out_time ?? 'Not specified'}</Text>
          {hotel.policies ? <Text style={styles.meta}>Policies: {hotel.policies}</Text> : null}
          <Text style={styles.sectionTitle}>Rooms ({hotel.rooms?.length ?? 0})</Text>
          {hotel.rooms?.map((room) => (
            <Text key={room.id} style={styles.meta}>
              {room.type}: {room.price_per_night} per night · {room.capacity_guests} guests · {room.total_rooms} available units
              {room.amenities.length ? ` · ${room.amenities.join(', ')}` : ''}
            </Text>
          ))}
          <Text style={styles.meta}>Cover image: {hotel.cover_image ?? 'Not provided'}</Text>
          {hotel.images?.length ? <Text style={styles.meta}>Images: {hotel.images.join(', ')}</Text> : null}
          {hotel.rejection_reason ? <Text style={styles.rejection}>Previous reason: {hotel.rejection_reason}</Text> : null}
          {hotel.approval_status !== 'approved' ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busyId === hotel.id}
              style={styles.primaryButton}
              onPress={() => void performReview(hotel, 'approved', null)}
            >
              <Text style={styles.buttonText}>{busyId === hotel.id ? 'Saving…' : 'Approve hotel'}</Text>
            </TouchableOpacity>
          ) : null}
          {hotel.approval_status !== 'rejected' ? (
            <>
              <TextInput
                accessibilityLabel={`Rejection reason for ${hotel.name}`}
                value={reasons[hotel.id] ?? ''}
                onChangeText={(value) => setReasons((current) => ({ ...current, [hotel.id]: value }))}
                placeholder="Reason required to reject"
                multiline
                style={styles.input}
              />
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busyId === hotel.id}
                style={styles.rejectButton}
                onPress={() => void performReview(hotel, 'rejected', null)}
              >
                <Text style={styles.buttonText}>Reject</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {hotel.approval_status === 'approved' ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busyId === hotel.id}
              style={styles.secondaryButton}
              onPress={() => void performReview(hotel, null, !hotel.featured)}
            >
              <Text style={styles.secondaryButtonText}>{hotel.featured ? 'Remove featured' : 'Feature hotel'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#E2E8F0' },
  filterSelected: { backgroundColor: '#1D4ED8' },
  filterText: { color: '#334155', textTransform: 'capitalize', fontWeight: '600' },
  filterTextSelected: { color: '#FFFFFF' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C' },
  card: { padding: 14, gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12 },
  name: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  sectionTitle: { marginTop: 4, fontWeight: '700', color: '#0F172A' },
  meta: { color: '#475569' },
  description: { color: '#334155' },
  rejection: { color: '#B91C1C' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 10, color: '#0F172A' },
  primaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#15803D' },
  rejectButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#B91C1C' },
  smallButton: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: '#1D4ED8' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#1D4ED8' },
  secondaryButtonText: { color: '#1D4ED8', fontWeight: '700' },
});
