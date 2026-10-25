import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '@/store/auth.store';
import { supabase } from '@/lib/supabase';
import { getCached, invalidateCached, loadCached } from '@/lib/query-cache';

type BookingRow = {
  id: string;
  hotel_id: string;
  booking_status: string;
  payment_status: string;
  total_price: number;
  check_in: string;
  check_out: string;
  created_at: string;
  hotels: { name: string; city: string } | null;
};

type TabName = 'active' | 'past' | 'cancelled';

const tabs: { key: TabName; label: string }[] = [
  { key: 'active', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const isPastDate = (value: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T00:00:00`) < today;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
};

export default function BookingsScreen() {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const userId = session?.user.id;
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('active');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadBookings = useCallback(async (pull = false) => {
    const cacheKey = `bookings:${userId ?? ''}`;
    if (pull) setRefreshing(true);
    else if (userId && !getCached<BookingRow[]>(cacheKey)) setLoading(true);
    setError(null);

    if (!userId) {
      setBookings([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const data = await loadCached(cacheKey, async () => {
        const { data: rows, error: fetchError } = await supabase
          .from('bookings')
          .select('id, hotel_id, booking_status, payment_status, total_price, check_in, check_out, created_at, hotels(name, city)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (fetchError) throw fetchError;
        return (rows ?? []) as BookingRow[];
      }, 20000, pull);
      setBookings(data);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, 'Unable to load your bookings.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const refreshBookings = useCallback(() => {
    if (userId) invalidateCached(`bookings:${userId}`);
    void loadBookings(true);
  }, [loadBookings, userId]);

  useFocusEffect(useCallback(() => {
    void loadBookings();
  }, [loadBookings]));

  const cancelBooking = (booking: BookingRow) => {
    Alert.alert(
      'Cancel this booking?',
      'This will cancel your reservation and release the room for other guests.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setCancellingId(booking.id);
              setError(null);
              try {
                const { error: cancelError } = await supabase.rpc('cancel_guest_booking', {
                  p_booking_id: booking.id,
                });
                if (cancelError) throw cancelError;

                setBookings((current) => current.map((item) =>
                  item.id === booking.id ? { ...item, booking_status: 'cancelled' } : item,
                ));
                invalidateCached(`bookings:${userId ?? ''}`);
                setActiveTab('cancelled');
                void loadBookings(true);
              } catch (caughtError) {
                setError(getErrorMessage(caughtError, 'Unable to cancel this booking.'));
              } finally {
                setCancellingId(null);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  };

  const visibleBookings = bookings.filter((booking) => {
    if (activeTab === 'cancelled') return booking.booking_status === 'cancelled';
    if (booking.booking_status === 'cancelled') return false;
    if (activeTab === 'past') {
      return booking.booking_status === 'completed' || isPastDate(booking.check_out);
    }
    return (booking.booking_status === 'pending' || booking.booking_status === 'confirmed')
      && !isPastDate(booking.check_out);
  });

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshBookings} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>YOUR TRAVEL</Text>
            <Text style={styles.title}>Trips</Text>
            <Text style={styles.subtitle}>All your stays, together in one place.</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="briefcase-outline" size={23} color="#087E8B" />
          </View>
        </View>

        <View style={styles.filterBar}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.key;
            const count = bookings.filter((booking) => {
              if (tab.key === 'cancelled') return booking.booking_status === 'cancelled';
              if (booking.booking_status === 'cancelled') return false;
              if (tab.key === 'past') {
                return booking.booking_status === 'completed' || isPastDate(booking.check_out);
              }
              return (booking.booking_status === 'pending' || booking.booking_status === 'confirmed')
                && !isPastDate(booking.check_out);
            }).length;

            return (
              <TouchableOpacity
                key={tab.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.filterButton, selected && styles.filterButtonSelected]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{tab.label}</Text>
                <View style={[styles.countBadge, selected && styles.countBadgeSelected]}>
                  <Text style={[styles.countText, selected && styles.countTextSelected]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <Ionicons name="hourglass-outline" size={22} color="#087E8B" />
            <Text style={styles.stateText}>Loading your trips…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}><Ionicons name="alert-circle-outline" size={19} color="#B42318" /></View>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Bookings unavailable</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => void loadBookings()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !error && visibleBookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyArtwork}>
              <View style={styles.artworkCircle}>
                <Ionicons name="bed-outline" size={38} color="#087E8B" />
              </View>
              <View style={styles.artworkSparkle}><Ionicons name="sparkles" size={15} color="#C7892E" /></View>
              <View style={styles.artworkDot} />
            </View>
            <Text style={styles.emptyTitle}>
              {session
                ? activeTab === 'active'
                  ? 'Your next stay is waiting'
                  : `No ${tabs.find((tab) => tab.key === activeTab)?.label.toLowerCase()} trips`
                : 'Your trips start here'}
            </Text>
            <Text style={styles.emptyText}>
              {session
                ? activeTab === 'active'
                  ? 'When you book a stay, the details and updates will be right here.'
                  : `You don’t have any ${tabs.find((tab) => tab.key === activeTab)?.label.toLowerCase()} bookings yet.`
                : 'Sign in to keep your bookings organized, or explore stays to plan your next trip.'}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.primaryButton}
              onPress={() => router.push(session ? '/search' : '/login')}
            >
              <Text style={styles.primaryButtonText}>{session ? 'Explore stays' : 'Sign in'}</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            {!session ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.textButton}
                onPress={() => router.push('/search')}
              >
                <Text style={styles.textButtonText}>Browse hotels first</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {!loading && !error && visibleBookings.length > 0 ? (
          <View style={styles.list}>
            <View style={styles.listHeading}>
              <View>
                <Text style={styles.listTitle}>
                  {activeTab === 'active' ? 'Upcoming stays' : activeTab === 'past' ? 'Past stays' : 'Cancelled stays'}
                </Text>
                <Text style={styles.listSubtitle}>
                  {visibleBookings.length} reservation{visibleBookings.length === 1 ? '' : 's'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.exploreButton}
                onPress={() => router.push('/search')}
              >
                <Ionicons name="add" size={16} color="#087E8B" />
                <Text style={styles.exploreButtonText}>Find a stay</Text>
              </TouchableOpacity>
            </View>

            {visibleBookings.map((booking) => {
              const cancelled = booking.booking_status === 'cancelled';
              const paid = booking.payment_status === 'paid';
              const cancellable = !cancelled
                && !paid
                && ['pending', 'confirmed'].includes(booking.booking_status);
              return (
                <View key={booking.id} style={styles.bookingCard}>
                  <Link href={{ pathname: '/booking/[id]', params: { id: booking.id } }} asChild>
                    <TouchableOpacity style={styles.bookingCardMain} activeOpacity={0.86}>
                      <View style={styles.hotelIcon}>
                        <Ionicons name="bed-outline" size={21} color="#087E8B" />
                      </View>
                      <View style={styles.bookingDetails}>
                        <View style={styles.bookingTitleRow}>
                          <Text style={styles.hotelName} numberOfLines={1}>
                            {booking.hotels?.name ?? 'Your hotel stay'}
                          </Text>
                          <View style={[
                            styles.statusBadge,
                            cancelled ? styles.cancelledBadge : styles.confirmedBadge,
                          ]}>
                            <Text style={[
                              styles.statusText,
                              cancelled ? styles.cancelledText : styles.confirmedText,
                            ]}>
                              {booking.booking_status}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.hotelLocation}>
                          <Ionicons name="location-outline" size={12} color="#82939B" /> {booking.hotels?.city ?? 'Sierra Leone'}
                        </Text>
                        <View style={styles.dateRow}>
                          <Ionicons name="calendar-outline" size={14} color="#087E8B" />
                          <Text style={styles.dateText}>{formatDate(booking.check_in)} – {formatDate(booking.check_out)}</Text>
                        </View>
                        <View style={styles.bookingFooter}>
                          <View style={[styles.paymentBadge, paid ? styles.paidBadge : styles.unpaidBadge]}>
                            <View style={[styles.paymentDot, paid ? styles.paidDot : styles.unpaidDot]} />
                            <Text style={[styles.paymentText, paid ? styles.paidText : styles.unpaidText]}>
                              {booking.payment_status}
                            </Text>
                          </View>
                          <Text style={styles.price}>{formatMoney(booking.total_price)}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={17} color="#9AA8AD" />
                    </TouchableOpacity>
                  </Link>
                  {cancellable ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel booking at ${booking.hotels?.name ?? 'this hotel'}`}
                      style={styles.cancelButton}
                      onPress={() => cancelBooking(booking)}
                      disabled={cancellingId === booking.id}
                    >
                      <Ionicons
                        name={cancellingId === booking.id ? 'hourglass-outline' : 'close-circle-outline'}
                        size={16}
                        color="#B42318"
                      />
                      <Text style={styles.cancelButtonText}>
                        {cancellingId === booking.id ? 'Cancelling…' : 'Cancel booking'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    padding: 22,
    paddingBottom: 36,
    gap: 19,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#087E8B',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  title: {
    color: '#17354B',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 5,
  },
  subtitle: {
    color: '#819199',
    fontSize: 12,
    marginTop: 4,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F4',
  },
  filterBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 13,
    backgroundColor: '#E9EFF0',
  },
  filterButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  filterButtonSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#17354B',
    shadowOpacity: 0.07,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  filterText: {
    color: '#72848D',
    fontSize: 11,
    fontWeight: '700',
  },
  filterTextSelected: {
    color: '#17354B',
    fontWeight: '800',
  },
  countBadge: {
    minWidth: 19,
    height: 19,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#DDE6E8',
  },
  countBadgeSelected: {
    backgroundColor: '#EAF5F4',
  },
  countText: {
    color: '#71838B',
    fontSize: 9,
    fontWeight: '800',
  },
  countTextSelected: {
    color: '#087E8B',
  },
  stateCard: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateText: {
    color: '#718397',
    fontSize: 12,
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
  errorIcon: {
    width: 33,
    height: 33,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#FDEAE8',
  },
  errorCopy: {
    flex: 1,
  },
  errorTitle: {
    color: '#8F241C',
    fontSize: 11,
    fontWeight: '800',
  },
  errorText: {
    color: '#A64339',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  retryButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#A84339',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyCard: {
    flex: 1,
    minHeight: 370,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
    borderWidth: 1,
    borderColor: '#E8EFF0',
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
  },
  emptyArtwork: {
    width: 124,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },
  artworkCircle: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: '#CFE5E1',
    backgroundColor: '#F0FAF8',
  },
  artworkSparkle: {
    position: 'absolute',
    top: 10,
    right: 9,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#FFF3DB',
  },
  artworkDot: {
    position: 'absolute',
    bottom: 14,
    left: 7,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#F2B544',
  },
  emptyTitle: {
    color: '#17354B',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 390,
    color: '#819199',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: '#087E8B',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  textButton: {
    padding: 12,
  },
  textButtonText: {
    color: '#087E8B',
    fontSize: 11,
    fontWeight: '800',
  },
  list: {
    gap: 11,
  },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  listTitle: {
    color: '#17354B',
    fontSize: 15,
    fontWeight: '800',
  },
  listSubtitle: {
    color: '#8B9AA1',
    fontSize: 10,
    marginTop: 4,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#EAF5F4',
  },
  exploreButtonText: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
  },
  bookingCard: {
    borderWidth: 1,
    borderColor: '#E8EFF0',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  bookingCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
  },
  cancelButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1E5E4',
    backgroundColor: '#FFFAFA',
  },
  cancelButtonText: {
    color: '#B42318',
    fontSize: 11,
    fontWeight: '800',
  },
  hotelIcon: {
    width: 45,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#EAF5F4',
  },
  bookingDetails: {
    flex: 1,
    minWidth: 0,
  },
  bookingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  hotelName: {
    flex: 1,
    color: '#17354B',
    fontSize: 12,
    fontWeight: '800',
  },
  hotelLocation: {
    color: '#82939B',
    fontSize: 10,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confirmedBadge: {
    backgroundColor: '#E8F5EC',
  },
  cancelledBadge: {
    backgroundColor: '#FDEAE8',
  },
  statusText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  confirmedText: {
    color: '#2B8051',
  },
  cancelledText: {
    color: '#B42318',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dateText: {
    color: '#526974',
    fontSize: 10,
    fontWeight: '600',
  },
  bookingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  paidBadge: {
    backgroundColor: '#EAF5F4',
  },
  unpaidBadge: {
    backgroundColor: '#FFF3E5',
  },
  paymentDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  paidDot: {
    backgroundColor: '#087E8B',
  },
  unpaidDot: {
    backgroundColor: '#C47A2C',
  },
  paymentText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  paidText: {
    color: '#087E8B',
  },
  unpaidText: {
    color: '#AE6B20',
  },
  price: {
    color: '#17354B',
    fontSize: 12,
    fontWeight: '900',
  },
});
