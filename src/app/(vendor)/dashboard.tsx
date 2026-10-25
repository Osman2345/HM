import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';

type VendorHotel = {
  id: string;
  name: string;
  approval_status: string;
};

type VendorBooking = {
  id: string;
  hotel_id: string | null;
  booking_status: string;
  created_at: string;
};

const metrics = [
  { key: 'bookings', label: 'Total bookings', icon: 'calendar-outline', tint: '#2879B8', background: '#EAF4FC' },
  { key: 'pendingBookings', label: 'Pending requests', icon: 'time-outline', tint: '#C47A2C', background: '#FFF3E5' },
  { key: 'liveHotels', label: 'Live properties', icon: 'business-outline', tint: '#087E8B', background: '#E8F5F3' },
  { key: 'pendingHotels', label: 'Needs attention', icon: 'hourglass-outline', tint: '#7861BB', background: '#F1EDFC' },
] as const;

export default function VendorDashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const userId = useAuthStore((state) => state.session?.user.id ?? null);
  const profileName = useAuthStore((state) => state.profile?.fullname);
  const [hotels, setHotels] = useState<VendorHotel[]>([]);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [bookingCount, setBookingCount] = useState(0);
  const [pendingBookingCount, setPendingBookingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (pull = false) => {
    if (!userId) {
      setError('Sign in again to view your partner dashboard.');
      setLoading(false);
      return;
    }

    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data: hotelData, error: hotelError } = await supabase
        .from('hotels')
        .select('id, name, approval_status')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });
      if (hotelError) throw hotelError;

      const ownedHotels = (hotelData ?? []) as VendorHotel[];
      setHotels(ownedHotels);

      if (ownedHotels.length === 0) {
        setBookings([]);
        setBookingCount(0);
        setPendingBookingCount(0);
        return;
      }

      const hotelIds = ownedHotels.map((hotel) => hotel.id);
      const [allBookings, pendingBookings, recentBookings] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true }).in('hotel_id', hotelIds),
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .in('hotel_id', hotelIds)
          .eq('booking_status', 'pending'),
        supabase
          .from('bookings')
          .select('id, hotel_id, booking_status, created_at')
          .in('hotel_id', hotelIds)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (allBookings.error) throw allBookings.error;
      if (pendingBookings.error) throw pendingBookings.error;
      if (recentBookings.error) throw recentBookings.error;

      setBookingCount(allBookings.count ?? 0);
      setPendingBookingCount(pendingBookings.count ?? 0);
      setBookings((recentBookings.data ?? []) as VendorBooking[]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load your partner dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeout);
  }, [refresh]);

  const hotelNames = useMemo(
    () => new Map(hotels.map((hotel) => [hotel.id, hotel.name])),
    [hotels],
  );
  const liveHotels = hotels.filter((hotel) => hotel.approval_status === 'approved').length;
  const pendingHotels = hotels.filter((hotel) => hotel.approval_status === 'pending').length;
  const metricValues = {
    bookings: bookingCount,
    pendingBookings: pendingBookingCount,
    liveHotels,
    pendingHotels,
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, compact && styles.containerCompact]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <View style={[styles.welcomeCard, compact && styles.welcomeCardCompact]}>
        <View style={styles.welcomeCopy}>
          <Text style={styles.eyebrow}>PARTNER OVERVIEW</Text>
          <Text style={styles.welcomeTitle}>Welcome back{profileName ? `, ${profileName.split(' ')[0]}` : ''}</Text>
          <Text style={styles.welcomeSubtitle}>
            Keep an eye on your properties and guest bookings from one place.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.welcomeAction}
            onPress={() => router.push('/(vendor)/hotels')}
          >
            <Text style={styles.welcomeActionText}>Manage properties</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.welcomeIcon}>
          <Ionicons name="business-outline" size={30} color="#D8F5F0" />
        </View>
      </View>

      {loading ? <Text style={styles.state}>Loading your business overview…</Text> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>Dashboard unavailable</Text>
            <Text style={styles.error}>{error}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => void refresh()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && !error ? (
        <>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Your performance</Text>
              <Text style={styles.sectionSubtitle}>A current snapshot of your account</Text>
            </View>
            <View style={styles.liveIndicator}><View style={styles.liveDot} /><Text style={styles.liveText}>UPDATED</Text></View>
          </View>

          <View style={[styles.metricGrid, compact && styles.metricGridCompact]}>
            {metrics.map((metric) => (
              <View key={metric.key} style={[styles.metricCard, compact && styles.metricCardCompact]}>
                <View style={styles.metricTop}>
                  <View style={[styles.metricIcon, { backgroundColor: metric.background }]}>
                    <Ionicons name={metric.icon} size={19} color={metric.tint} />
                  </View>
                  <Ionicons name="trending-up-outline" size={17} color="#A0AFB5" />
                </View>
                <Text style={styles.metricValue}>{metricValues[metric.key].toLocaleString()}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.contentGrid, compact && styles.contentGridCompact]}>
            <View style={styles.panel}>
              <View style={styles.panelHeading}>
                <View>
                  <Text style={styles.panelTitle}>Recent bookings</Text>
                  <Text style={styles.panelSubtitle}>Latest reservations at your properties</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.viewAllButton}
                  onPress={() => router.push('/(vendor)/bookings')}
                >
                  <Text style={styles.viewAllText}>View all</Text>
                  <Ionicons name="arrow-forward" size={14} color="#087E8B" />
                </TouchableOpacity>
              </View>

              {bookings.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}><Ionicons name="calendar-outline" size={21} color="#087E8B" /></View>
                  <Text style={styles.emptyTitle}>No bookings yet</Text>
                  <Text style={styles.emptyCopy}>When guests book one of your properties, it will appear here.</Text>
                </View>
              ) : (
                bookings.map((booking) => (
                  <View key={booking.id} style={styles.bookingRow}>
                    <View style={styles.bookingIcon}>
                      <Ionicons name="bed-outline" size={17} color="#087E8B" />
                    </View>
                    <View style={styles.bookingCopy}>
                      <Text style={styles.bookingHotel} numberOfLines={1}>
                        {(booking.hotel_id ? hotelNames.get(booking.hotel_id) : null) ?? 'Your property'}
                      </Text>
                      <Text style={styles.bookingMeta}>
                        Booking {booking.id.slice(0, 8)} · {new Date(booking.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      booking.booking_status === 'confirmed' ? styles.confirmedBadge : styles.pendingBadge,
                    ]}>
                      <Text style={[
                        styles.statusText,
                        booking.booking_status === 'confirmed' ? styles.confirmedText : styles.pendingText,
                      ]}>
                        {booking.booking_status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeading}>
                <View>
                  <Text style={styles.panelTitle}>Property status</Text>
                  <Text style={styles.panelSubtitle}>Approved vendor listings publish immediately</Text>
                </View>
                <View style={styles.panelIcon}><Ionicons name="business-outline" size={18} color="#087E8B" /></View>
              </View>
              {hotels.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Start welcoming guests</Text>
                  <Text style={styles.emptyCopy}>Create your first property listing to get started.</Text>
                </View>
              ) : hotels.slice(0, 5).map((hotel) => (
                <View key={hotel.id} style={styles.hotelRow}>
                  <View style={styles.hotelMark}><Ionicons name="business-outline" size={16} color="#087E8B" /></View>
                  <Text style={styles.hotelName} numberOfLines={1}>{hotel.name}</Text>
                  <View style={[
                    styles.statusBadge,
                    hotel.approval_status === 'approved' ? styles.confirmedBadge : styles.pendingBadge,
                  ]}>
                    <Text style={[
                      styles.statusText,
                      hotel.approval_status === 'approved' ? styles.confirmedText : styles.pendingText,
                    ]}>
                      {hotel.approval_status}
                    </Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.panelLink}
                onPress={() => router.push('/(vendor)/hotels')}
              >
                <Text style={styles.panelLinkText}>Manage your properties</Text>
                <Ionicons name="arrow-forward" size={15} color="#087E8B" />
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 28,
    paddingBottom: 42,
    gap: 21,
  },
  containerCompact: {
    padding: 16,
    gap: 17,
  },
  welcomeCard: {
    minHeight: 174,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 27,
    paddingVertical: 23,
    borderRadius: 19,
    backgroundColor: '#173B4A',
    overflow: 'hidden',
  },
  welcomeCardCompact: {
    minHeight: 174,
    paddingHorizontal: 19,
  },
  welcomeCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#A5DCD7',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  welcomeTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 9,
  },
  welcomeSubtitle: {
    color: '#C2D4D9',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 450,
  },
  welcomeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: '#087E8B',
  },
  welcomeActionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  welcomeIcon: {
    width: 59,
    height: 59,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 14,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#17354B',
    fontSize: 17,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#8B9AA1',
    fontSize: 11,
    marginTop: 4,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D7E9E4',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2EAA79',
  },
  liveText: {
    color: '#4B8371',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,
  },
  metricGridCompact: {
    gap: 10,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 143,
    padding: 17,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E9EFF0',
    backgroundColor: '#FFFFFF',
  },
  metricCardCompact: {
    flexBasis: '46%',
    minWidth: 0,
    padding: 13,
  },
  metricTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricIcon: {
    width: 37,
    height: 37,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    color: '#17354B',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 15,
  },
  metricLabel: {
    color: '#798B94',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  contentGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  contentGridCompact: {
    flexDirection: 'column',
  },
  panel: {
    flex: 1,
    minWidth: 0,
    padding: 18,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E9EFF0',
    backgroundColor: '#FFFFFF',
  },
  panelHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  panelTitle: {
    color: '#17354B',
    fontSize: 14,
    fontWeight: '800',
  },
  panelSubtitle: {
    color: '#8B9AA1',
    fontSize: 10,
    marginTop: 4,
  },
  panelIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F4',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  viewAllText: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
  },
  bookingRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#EFF2F2',
  },
  bookingIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5F3',
  },
  bookingCopy: {
    flex: 1,
    minWidth: 0,
  },
  bookingHotel: {
    color: '#294655',
    fontSize: 11,
    fontWeight: '800',
  },
  bookingMeta: {
    color: '#8B9AA1',
    fontSize: 9,
    marginTop: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  confirmedBadge: {
    backgroundColor: '#E8F5EC',
  },
  pendingBadge: {
    backgroundColor: '#FFF3E5',
  },
  statusText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  confirmedText: {
    color: '#2B8051',
  },
  pendingText: {
    color: '#AE6B20',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F4',
    marginBottom: 10,
  },
  emptyTitle: {
    color: '#294655',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCopy: {
    color: '#8B9AA1',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
    textAlign: 'center',
    maxWidth: 240,
  },
  hotelRow: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#EFF2F2',
  },
  hotelMark: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F4',
  },
  hotelName: {
    flex: 1,
    color: '#526974',
    fontSize: 10,
    fontWeight: '700',
  },
  panelLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingTop: 12,
  },
  panelLinkText: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
  },
  state: {
    color: '#718397',
    paddingVertical: 10,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F5D6D3',
    borderRadius: 13,
    backgroundColor: '#FFF7F6',
  },
  errorCopy: {
    flex: 1,
  },
  errorTitle: {
    color: '#8F241C',
    fontSize: 12,
    fontWeight: '800',
  },
  error: {
    color: '#A64339',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#A84339',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
