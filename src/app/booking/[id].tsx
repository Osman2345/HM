import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBackendPayment, verifyBackendPayment } from '@/lib/backend';
import { supabase } from '@/lib/supabase';

const HOLD_DURATION_MS = 15 * 60 * 1000;

type BookingRow = {
  id: string;
  hotel_id: string | null;
  booking_status: string | null;
  payment_status: string | null;
  total_price: number | null;
  room_type: string | null;
  check_in: string | null;
  check_out: string | null;
  guests: number | null;
  rooms: number | null;
  created_at: string;
};

const prettyDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getNights = (checkIn: string | null, checkOut: string | null) => {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round((new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) / 86400000));
};

export default function BookingDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id: string;
    paymentReference?: string;
    authorizationUrl?: string;
    paymentSetupError?: string;
  }>();
  const bookingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [hotelName, setHotelName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentVerifyError, setPaymentVerifyError] = useState<string | null>(null);
  const [paymentNotice] = useState(
    typeof params.paymentSetupError === 'string' ? params.paymentSetupError : null,
  );
  const [paymentAuthorizationUrl, setPaymentAuthorizationUrl] = useState<string | null>(
    typeof params.authorizationUrl === 'string' ? params.authorizationUrl : null,
  );
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(Boolean(params.paymentReference));
  const [now, setNow] = useState(0);

  const loadBooking = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select('id, hotel_id, booking_status, payment_status, total_price, room_type, check_in, check_out, guests, rooms, created_at')
        .eq('id', bookingId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      const result = data as BookingRow | null;
      setBooking(result);
      setError(null);
      if (result?.hotel_id) {
        const { data: hotel, error: hotelError } = await supabase
          .from('hotels')
          .select('name')
          .eq('id', result.hotel_id)
          .maybeSingle();
        if (hotelError) throw hotelError;
        setHotelName(hotel?.name ?? '');
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load booking');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadBooking(), 0);
    return () => clearTimeout(initialLoad);
  }, [loadBooking]);

  useEffect(() => {
    const reference = typeof params.paymentReference === 'string' ? params.paymentReference : null;
    if (!reference) return;
    let isMounted = true;
    const verifyPayment = async () => {
      try {
        const response = await verifyBackendPayment(reference);
        if (!isMounted) return;
        setPaymentStatus(response?.data?.status ?? 'pending');
        await loadBooking();
      } catch (caughtError) {
        if (isMounted) {
          setPaymentVerifyError(caughtError instanceof Error ? caughtError.message : 'Payment verification failed');
        }
      } finally {
        if (isMounted) setVerifyingPayment(false);
      }
    };
    void verifyPayment();
    return () => {
      isMounted = false;
    };
  }, [loadBooking, params.paymentReference]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const paymentLabel = (paymentStatus && ['paid', 'success', 'pending', 'failed'].includes(paymentStatus.toLowerCase())
    ? paymentStatus
    : booking?.payment_status) ?? 'pending';
  const paymentComplete = ['paid', 'success'].includes(paymentLabel.toLowerCase());
  const paymentFailed = ['failed', 'refunded'].includes(paymentLabel.toLowerCase());
  const bookingCancelled = booking?.booking_status?.toLowerCase() === 'cancelled';
  const createdAt = booking ? new Date(booking.created_at).getTime() : Number.NaN;
  const holdExpiresAt = createdAt + HOLD_DURATION_MS;
  const holdExpired = !Number.isFinite(createdAt) || now >= holdExpiresAt;
  const holdRemaining = Math.max(0, holdExpiresAt - now);
  const holdMinutes = Math.floor(holdRemaining / 60000);
  const holdSeconds = Math.floor((holdRemaining % 60000) / 1000);
  const nights = getNights(booking?.check_in ?? null, booking?.check_out ?? null);
  const canPay = !paymentComplete && !paymentFailed && !bookingCancelled && !holdExpired && !verifyingPayment;

  const startPayment = async () => {
    if (!booking || !canPay) return;
    setError(null);
    setPaymentBusy(true);
    try {
      let authorizationUrl = paymentAuthorizationUrl;
      if (!authorizationUrl) {
        const payment = await createBackendPayment({ bookingId: booking.id });
        authorizationUrl = payment.authorization_url;
        setPaymentAuthorizationUrl(authorizationUrl);
      }
      await Linking.openURL(authorizationUrl);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to start payment');
    } finally {
      setPaymentBusy(false);
    }
  };

  if (loading) {
    return <View style={[styles.centerScreen, { paddingTop: insets.top }]}><ActivityIndicator color="#087E8B" /><Text style={styles.centerText}>Loading your booking…</Text></View>;
  }
  if (error && !booking) {
    return <View style={[styles.centerScreen, { paddingTop: insets.top }]}><Ionicons name="alert-circle-outline" size={32} color="#B42318" /><Text style={styles.centerText}>{error}</Text><TouchableOpacity style={styles.secondaryButton} onPress={() => void loadBooking()}><Text style={styles.secondaryButtonText}>Try again</Text></TouchableOpacity></View>;
  }
  if (!booking) {
    return <View style={[styles.centerScreen, { paddingTop: insets.top }]}><Text style={styles.centerText}>Booking not found.</Text><TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}><Text style={styles.secondaryButtonText}>Go back</Text></TouchableOpacity></View>;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 28 }]}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
        <Ionicons name="arrow-back" size={20} color="#0F172A" /><Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.statusHero, paymentComplete && styles.statusHeroPaid, (paymentFailed || bookingCancelled) && styles.statusHeroFailed]}>
        <View style={[styles.statusIcon, paymentComplete && styles.statusIconPaid, (paymentFailed || bookingCancelled) && styles.statusIconFailed]}>
          <Ionicons
            name={paymentComplete ? 'checkmark' : (paymentFailed || bookingCancelled) ? 'close' : 'card-outline'}
            size={25}
            color={paymentComplete ? '#027A48' : (paymentFailed || bookingCancelled) ? '#B42318' : '#087E8B'}
          />
        </View>
        <Text style={styles.eyebrow}>{paymentComplete ? 'YOU’RE ALL SET' : bookingCancelled ? 'BOOKING CANCELLED' : paymentFailed ? 'PAYMENT NOT COMPLETED' : 'ALMOST THERE'}</Text>
        <Text style={styles.heading}>{paymentComplete ? 'Booking confirmed' : bookingCancelled ? 'This booking is cancelled' : paymentFailed ? 'Payment failed' : 'Complete your booking'}</Text>
        <Text style={styles.subtitle}>{hotelName || `Booking #${booking.id.slice(0, 8).toUpperCase()}`}</Text>
      </View>

      {!paymentComplete && !paymentFailed && !bookingCancelled ? (
        <View style={[styles.holdBanner, holdExpired && styles.holdExpiredBanner]}>
          <Ionicons name={holdExpired ? 'time-outline' : 'hourglass-outline'} size={19} color={holdExpired ? '#B42318' : '#9A6700'} />
          <View style={styles.holdTextGroup}>
            <Text style={[styles.holdTitle, holdExpired && styles.holdExpiredText]}>
              {holdExpired ? 'Your room hold has expired' : `Room held for ${String(holdMinutes).padStart(2, '0')}:${String(holdSeconds).padStart(2, '0')}`}
            </Text>
            <Text style={[styles.holdSubtitle, holdExpired && styles.holdExpiredText]}>
              {holdExpired ? 'Choose the room and dates again to check current availability.' : 'Finish payment before the timer ends to keep this room.'}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardHeadingRow}>
          <View><Text style={styles.cardEyebrow}>STAY DETAILS</Text><Text style={styles.cardTitle}>Your reservation</Text></View>
          <View style={[styles.statusPill, paymentComplete && styles.paidPill, (paymentFailed || bookingCancelled) && styles.failedPill]}>
            <View style={[styles.statusDot, paymentComplete && styles.paidDot, (paymentFailed || bookingCancelled) && styles.failedDot]} />
            <Text style={[styles.statusPillText, paymentComplete && styles.paidText, (paymentFailed || bookingCancelled) && styles.failedText]}>
              {paymentComplete ? 'Paid' : bookingCancelled ? 'Cancelled' : paymentFailed ? 'Failed' : 'Pending'}
            </Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailIcon}><Ionicons name="bed-outline" size={17} color="#087E8B" /></View>
          <View style={styles.detailCopy}><Text style={styles.detailLabel}>ROOM TYPE</Text><Text style={styles.detailValue}>{booking.room_type ?? 'Room'}</Text></View>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailIcon}><Ionicons name="calendar-outline" size={17} color="#087E8B" /></View>
          <View style={styles.detailCopy}>
            <Text style={styles.detailLabel}>YOUR DATES · {nights} {nights === 1 ? 'NIGHT' : 'NIGHTS'}</Text>
            <Text style={styles.detailValue}>{prettyDate(booking.check_in)} — {prettyDate(booking.check_out)}</Text>
          </View>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailIcon}><Ionicons name="people-outline" size={17} color="#087E8B" /></View>
          <View style={styles.detailCopy}><Text style={styles.detailLabel}>GUESTS & ROOMS</Text><Text style={styles.detailValue}>{booking.guests ?? 1} guests · {booking.rooms ?? 1} {booking.rooms === 1 ? 'room' : 'rooms'}</Text></View>
        </View>
        <View style={styles.cardDivider} />
        <View style={styles.totalRow}>
          <View><Text style={styles.totalLabel}>Total price</Text><Text style={styles.totalHint}>Sierra Leonean leones (SLE)</Text></View>
          <Text style={styles.totalAmount}>Le {Number(booking.total_price ?? 0).toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.paymentCard}>
        <View style={styles.paymentHeading}>
          <View style={styles.paymentHeadingIcon}><Ionicons name="shield-checkmark-outline" size={19} color="#087E8B" /></View>
          <View><Text style={styles.paymentTitle}>Secure payment</Text><Text style={styles.paymentSubtitle}>Protected checkout powered by Monime</Text></View>
        </View>
        <View style={styles.paymentDivider} />
        <View style={styles.paymentStateRow}>
          <Text style={styles.paymentStateLabel}>Payment status</Text>
          <Text style={[styles.paymentStateValue, paymentComplete && styles.paidText, paymentFailed && styles.failedText]}>{paymentComplete ? 'Paid' : paymentFailed ? 'Failed' : paymentStatus === 'pending' ? 'Awaiting payment' : 'Not paid yet'}</Text>
        </View>
      </View>

      {paymentComplete ? (
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(tabs)/bookings')}>
          <Ionicons name="receipt-outline" size={19} color="#FFFFFF" /><Text style={styles.primaryButtonText}>View my bookings</Text>
        </TouchableOpacity>
      ) : holdExpired && !paymentFailed && !bookingCancelled ? (
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace({ pathname: '/booking/new', params: { hotelId: booking.hotel_id ?? '' } })} disabled={!booking.hotel_id}>
          <Ionicons name="refresh-outline" size={19} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Check availability again</Text>
        </TouchableOpacity>
      ) : canPay ? (
        <TouchableOpacity style={[styles.primaryButton, paymentBusy && styles.buttonBusy]} onPress={() => void startPayment()} disabled={paymentBusy}>
          {paymentBusy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="lock-closed-outline" size={19} color="#FFFFFF" />}
          <Text style={styles.primaryButtonText}>{paymentBusy ? 'Opening secure checkout…' : paymentAuthorizationUrl ? 'Continue to payment' : 'Pay now'}</Text>
          {!paymentBusy ? <Ionicons name="arrow-forward" size={17} color="#FFFFFF" /> : null}
        </TouchableOpacity>
      ) : null}

      {paymentFailed || bookingCancelled ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={() => booking.hotel_id && router.replace({ pathname: '/booking/new', params: { hotelId: booking.hotel_id } })} disabled={!booking.hotel_id}>
          <Text style={styles.secondaryButtonText}>Book this hotel again</Text>
        </TouchableOpacity>
      ) : null}

      {paymentNotice ? <View style={styles.notice}><Ionicons name="information-circle-outline" size={18} color="#087E8B" /><Text style={styles.noticeText}>{paymentNotice} You can retry while your room hold is active.</Text></View> : null}
      {paymentVerifyError ? <View style={styles.errorNotice}><Ionicons name="warning-outline" size={18} color="#B42318" /><Text style={styles.errorNoticeText}>Payment status could not be verified: {paymentVerifyError}</Text></View> : null}
      {error ? <View style={styles.errorNotice}><Ionicons name="warning-outline" size={18} color="#B42318" /><Text style={styles.errorNoticeText}>{error}</Text></View> : null}
      {verifyingPayment ? <View style={styles.verifying}><ActivityIndicator color="#087E8B" /><Text style={styles.verifyingText}>Verifying your payment securely…</Text></View> : null}
      <Text style={styles.footerNote}>Your room is only confirmed once payment is complete.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F8FA' },
  container: { paddingHorizontal: 20, gap: 14 },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28, backgroundColor: '#F5F8FA' },
  centerText: { color: '#475569', textAlign: 'center', fontSize: 14, lineHeight: 21 },
  backButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingRight: 10 },
  backText: { color: '#334155', fontSize: 14, fontWeight: '600' },
  statusHero: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#EAF7F7' },
  statusHeroPaid: { backgroundColor: '#ECFDF3' },
  statusHeroFailed: { backgroundColor: '#FEF3F2' },
  statusIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9F0F0', marginBottom: 11 },
  statusIconPaid: { backgroundColor: '#D1FADF' },
  statusIconFailed: { backgroundColor: '#FEE4E2' },
  eyebrow: { color: '#087E8B', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  heading: { color: '#102A36', fontSize: 23, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  subtitle: { color: '#64748B', fontSize: 13, marginTop: 4 },
  holdBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFAEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 15, padding: 13 },
  holdExpiredBanner: { backgroundColor: '#FEF3F2', borderColor: '#FECDCA' },
  holdTextGroup: { flex: 1 },
  holdTitle: { color: '#854A0E', fontSize: 12, fontWeight: '800' },
  holdSubtitle: { color: '#8A6A30', fontSize: 10, lineHeight: 15, marginTop: 3 },
  holdExpiredText: { color: '#B42318' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 19, borderWidth: 1, borderColor: '#E7EEF1', padding: 16 },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 13, marginBottom: 1, borderBottomWidth: 1, borderBottomColor: '#EDF2F4' },
  cardEyebrow: { color: '#81919A', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  cardTitle: { color: '#102A36', fontSize: 16, fontWeight: '800', marginTop: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFAEB', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 9 },
  paidPill: { backgroundColor: '#ECFDF3' },
  failedPill: { backgroundColor: '#FEF3F2' },
  statusDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#F79009' },
  paidDot: { backgroundColor: '#12B76A' },
  failedDot: { backgroundColor: '#F04438' },
  statusPillText: { color: '#B54708', fontSize: 10, fontWeight: '800' },
  paidText: { color: '#027A48' },
  failedText: { color: '#B42318' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 15 },
  detailIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#EAF7F7', alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1 },
  detailLabel: { color: '#81919A', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  detailValue: { color: '#243B46', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardDivider: { height: 1, backgroundColor: '#EDF2F4', marginTop: 16, marginBottom: 13 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { color: '#102A36', fontSize: 13, fontWeight: '800' },
  totalHint: { color: '#81919A', fontSize: 9, marginTop: 3 },
  totalAmount: { color: '#087E8B', fontSize: 20, fontWeight: '800' },
  paymentCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E7EEF1', padding: 15 },
  paymentHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentHeadingIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: '#EAF7F7', alignItems: 'center', justifyContent: 'center' },
  paymentTitle: { color: '#102A36', fontSize: 13, fontWeight: '800' },
  paymentSubtitle: { color: '#81919A', fontSize: 10, marginTop: 3 },
  paymentDivider: { height: 1, backgroundColor: '#EDF2F4', marginVertical: 13 },
  paymentStateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentStateLabel: { color: '#64748B', fontSize: 11 },
  paymentStateValue: { color: '#B54708', fontSize: 11, fontWeight: '800' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#087E8B', borderRadius: 15, paddingVertical: 16, shadowColor: '#087E8B', shadowOpacity: 0.16, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  buttonBusy: { opacity: 0.75 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 13, borderWidth: 1, borderColor: '#C9DADD', backgroundColor: '#FFFFFF' },
  secondaryButtonText: { color: '#087E8B', fontSize: 12, fontWeight: '800' },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 13, backgroundColor: '#EAF7F7' },
  noticeText: { flex: 1, color: '#49616B', fontSize: 11, lineHeight: 17 },
  errorNotice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 13, backgroundColor: '#FEF3F2' },
  errorNoticeText: { flex: 1, color: '#B42318', fontSize: 11, lineHeight: 17 },
  verifying: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  verifyingText: { color: '#64748B', fontSize: 11 },
  footerNote: { color: '#81919A', fontSize: 10, textAlign: 'center', paddingBottom: 4 },
});
