import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBackendPayment } from '@/lib/backend';
import { invalidateCached } from '@/lib/query-cache';
import { supabase } from '@/lib/supabase';

type HotelRoom = {
  type: string;
  price_per_night: number;
  capacity_guests: number;
  total_rooms: number;
};

type RoomAvailability = {
  room_type: string;
  total_rooms: number;
  reserved_rooms: number;
  available_rooms: number;
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateOffset = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatDate(date);
};

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) && formatDate(parsed) === value;
};

const getNights = (checkIn: string, checkOut: string) => {
  if (!isValidDate(checkIn) || !isValidDate(checkOut) || checkOut <= checkIn) return 0;
  return Math.round((new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) / 86400000);
};

export default function NewBookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ hotelId?: string | string[] }>();
  const hotelId = Array.isArray(params.hotelId) ? params.hotelId[0] : params.hotelId ?? '';
  const [checkIn, setCheckIn] = useState(() => getDateOffset(1));
  const [checkOut, setCheckOut] = useState(() => getDateOffset(2));
  const [guests, setGuests] = useState('2');
  const [rooms, setRooms] = useState('1');
  const [hotelName, setHotelName] = useState('');
  const [roomOptions, setRoomOptions] = useState<HotelRoom[]>([]);
  const [availabilityResult, setAvailabilityResult] = useState<{
    key: string;
    rows: RoomAvailability[];
    error: string | null;
  } | null>(null);
  const [roomType, setRoomType] = useState('');
  const [loadingHotel, setLoadingHotel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nights = getNights(checkIn, checkOut);
  const datesValid = isValidDate(checkIn)
    && isValidDate(checkOut)
    && checkIn >= formatDate(new Date())
    && checkOut > checkIn;
  const selectedRoom = roomOptions.find((room) => room.type === roomType);
  const availabilityKey = `${hotelId}|${checkIn}|${checkOut}`;
  const availabilityIsCurrent = availabilityResult?.key === availabilityKey;
  const availability = availabilityIsCurrent ? availabilityResult.rows : [];
  const loadingAvailability = datesValid && !availabilityIsCurrent;
  const availabilityError = availabilityIsCurrent ? availabilityResult.error : null;
  const selectedAvailability = availability.find((room) => room.room_type === roomType);
  const roomCount = Number(rooms);
  const guestCount = Number(guests);
  const totalPrice = selectedRoom && Number.isInteger(roomCount) && roomCount > 0
    ? selectedRoom.price_per_night * nights * roomCount
    : 0;

  useEffect(() => {
    let active = true;
    const loadHotel = async () => {
      setLoadingHotel(true);
      setError(null);
      if (!hotelId) {
        setError('Hotel not selected. Go back and choose a hotel.');
        setLoadingHotel(false);
        return;
      }

      try {
        const { data, error: hotelError } = await supabase
          .from('hotels')
          .select('name, rooms')
          .eq('id', hotelId)
          .eq('approval_status', 'approved')
          .maybeSingle();

        if (!active) return;
        if (hotelError) {
          setError(hotelError.message);
        } else if (!data) {
          setError('This hotel is not available for booking.');
        } else {
          const roomData = (data.rooms as HotelRoom[] | null) ?? [];
          const roomsWithCapacity = roomData.filter((room) => Boolean(room.type));
          setHotelName(data.name);
          setRoomOptions(roomsWithCapacity);
          setRoomType(roomsWithCapacity[0]?.type ?? '');
          if (roomsWithCapacity[0]) {
            setGuests(String(Math.min(2, Math.max(1, roomsWithCapacity[0].capacity_guests))));
          }
          if (!roomsWithCapacity.length) setError('This hotel has no room types available to book.');
        }
      } catch (caughtError) {
        if (active) setError(caughtError instanceof Error ? caughtError.message : 'Unable to load this hotel.');
      } finally {
        if (active) setLoadingHotel(false);
      }
    };

    void loadHotel();
    return () => {
      active = false;
    };
  }, [hotelId]);

  useEffect(() => {
    let active = true;
    if (!hotelId || !datesValid) return () => { active = false; };

    const loadAvailability = async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('get_room_availability', {
          p_hotel_id: hotelId,
          p_check_in: checkIn,
          p_check_out: checkOut,
        });
        if (rpcError) throw rpcError;
        if (active) {
          setAvailabilityResult({
            key: availabilityKey,
            rows: (data as RoomAvailability[] | null) ?? [],
            error: null,
          });
        }
      } catch (caughtError) {
        if (active) {
          setAvailabilityResult({
            key: availabilityKey,
            rows: [],
            error: caughtError instanceof Error ? caughtError.message : 'Could not check room availability.',
          });
        }
      }
    };

    void loadAvailability();
    return () => {
      active = false;
    };
  }, [availabilityKey, checkIn, checkOut, datesValid, hotelId]);

  const submit = async () => {
    Keyboard.dismiss();
    if (!hotelId) {
      setError('Hotel not selected. Go back and choose a hotel.');
      return;
    }
    if (!datesValid) {
      setError('Check-in must be today or later, and check-out must be after check-in.');
      return;
    }
    if (loadingAvailability || availabilityError || !selectedAvailability) {
      setError(availabilityError ?? 'Wait for room availability to finish loading before confirming.');
      return;
    }
    if (!selectedRoom || selectedAvailability.available_rooms < 1) {
      setError('This room type is sold out for the selected dates. Choose another room type or dates.');
      return;
    }
    if (!Number.isInteger(guestCount) || guestCount < 1) {
      setError('Enter at least one guest.');
      return;
    }
    if (!Number.isInteger(roomCount) || roomCount < 1) {
      setError('Enter at least one room.');
      return;
    }
    if (roomCount > selectedAvailability.available_rooms) {
      setError(`Only ${selectedAvailability.available_rooms} rooms are available for these dates.`);
      return;
    }
    if (guestCount > selectedRoom.capacity_guests * roomCount) {
      setError(`The selected rooms can accommodate up to ${selectedRoom.capacity_guests * roomCount} guests.`);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) {
        setError('You must be signed in to confirm a booking.');
        return;
      }

      const { data, error: bookingError } = await supabase.rpc('create_booking', {
        p_hotel_id: hotelId,
        p_room_type: roomType,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guests: guestCount,
        p_rooms: roomCount,
      });
      if (bookingError) throw bookingError;

      const booking = data as { id?: string } | null;
      if (!booking?.id) throw new Error('Booking could not be created.');
      invalidateCached(`bookings:${authData.user.id}`);
      invalidateCached('vendor-bookings:');
      invalidateCached(`vendor-dashboard:${authData.user.id}`);

      try {
        const payment = await createBackendPayment({ bookingId: booking.id });
        router.replace({
          pathname: '/booking/[id]',
          params: {
            id: booking.id,
            paymentReference: payment.reference,
            authorizationUrl: payment.authorization_url,
          },
        });
      } catch (paymentError) {
        router.replace({
          pathname: '/booking/[id]',
          params: {
            id: booking.id,
            paymentSetupError: paymentError instanceof Error
              ? `Booking saved, but payment could not be started: ${paymentError.message}`
              : 'Payment could not be started. You can try again from the booking details.',
          },
        });
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to create booking.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
        <Ionicons name="arrow-back" size={20} color="#0F172A" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="bed-outline" size={22} color="#087E8B" /></View>
        <Text style={styles.eyebrow}>YOUR STAY, YOUR WAY</Text>
        <Text style={styles.heading}>Confirm your stay</Text>
        <Text style={styles.subtitle}>{hotelName || (loadingHotel ? 'Loading hotel…' : 'Choose your dates and room')}</Text>
      </View>

      <View style={styles.stepRow}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
        <View><Text style={styles.stepTitle}>Your dates</Text><Text style={styles.stepHint}>Availability updates for your stay</Text></View>
      </View>
      <View style={styles.card}>
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.fieldLabel}>CHECK-IN</Text>
            <TextInput
              accessibilityLabel="Check-in date in year month day format"
              value={checkIn}
              onChangeText={setCheckIn}
              placeholder="YYYY-MM-DD"
              style={styles.dateInput}
              editable={!busy}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.dateDivider} />
          <View style={styles.dateField}>
            <Text style={styles.fieldLabel}>CHECK-OUT</Text>
            <TextInput
              accessibilityLabel="Check-out date in year month day format"
              value={checkOut}
              onChangeText={setCheckOut}
              placeholder="YYYY-MM-DD"
              style={styles.dateInput}
              editable={!busy}
              autoCapitalize="none"
            />
          </View>
        </View>
        <View style={styles.nightBadge}>
          <Ionicons name="moon-outline" size={14} color="#087E8B" />
          <Text style={styles.nightText}>{nights} {nights === 1 ? 'night' : 'nights'}</Text>
        </View>
        {!datesValid && (checkIn || checkOut) ? <Text style={styles.inlineHint}>Use YYYY-MM-DD. Check-out must be after check-in.</Text> : null}
      </View>

      <View style={styles.stepRow}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
        <View><Text style={styles.stepTitle}>Choose your room</Text><Text style={styles.stepHint}>Live availability for these dates</Text></View>
      </View>
      {!datesValid ? (
        <View style={styles.infoBanner}><Ionicons name="calendar-outline" size={18} color="#087E8B" /><Text style={styles.bannerText}>Enter valid dates to see which rooms are available.</Text></View>
      ) : loadingAvailability ? (
        <View style={styles.loadingCard}><ActivityIndicator color="#087E8B" /><Text style={styles.bannerText}>Checking dates with the hotel…</Text></View>
      ) : availabilityError ? (
        <View style={styles.errorBanner}><Ionicons name="warning-outline" size={18} color="#B42318" /><Text style={styles.errorText}>Room availability could not be checked. {availabilityError}</Text></View>
      ) : null}

      {roomOptions.map((room) => {
        const roomAvailability = availability.find((item) => item.room_type === room.type);
        const available = roomAvailability?.available_rooms ?? 0;
        const soldOut = !loadingAvailability && datesValid && Boolean(roomAvailability) && available === 0;
        const selected = roomType === room.type;
        return (
          <TouchableOpacity
            key={room.type}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: soldOut || !roomAvailability }}
            style={[styles.roomCard, selected && styles.roomCardSelected, soldOut && styles.roomCardSoldOut]}
            onPress={() => {
              setRoomType(room.type);
              setRooms('1');
              setGuests((current) => String(Math.min(Number(current) || 1, room.capacity_guests * Math.max(Number(rooms) || 1, 1))));
            }}
            disabled={busy || soldOut || !roomAvailability || loadingAvailability || Boolean(availabilityError)}
          >
            <View style={styles.roomTop}>
              <View style={[styles.roomIcon, selected && styles.roomIconSelected]}>
                <Ionicons name="bed-outline" size={20} color={selected ? '#FFFFFF' : '#087E8B'} />
              </View>
              <View style={styles.roomTitleGroup}>
                <Text style={styles.roomName}>{room.type}</Text>
                <Text style={styles.roomCapacity}><Ionicons name="people-outline" size={13} color="#64748B" />  Up to {room.capacity_guests} guests per room</Text>
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={22} color="#087E8B" /> : null}
            </View>
            <View style={styles.roomBottom}>
              <Text style={styles.roomPrice}>Le {Number(room.price_per_night).toLocaleString()}<Text style={styles.perNight}> / night</Text></Text>
              {datesValid && roomAvailability ? (
                <View style={[styles.availabilityPill, soldOut && styles.soldOutPill]}>
                  <View style={[styles.availabilityDot, soldOut && styles.soldOutDot]} />
                  <Text style={[styles.availabilityText, soldOut && styles.soldOutText]}>
                    {soldOut ? 'Not available' : `${available} ${available === 1 ? 'room' : 'rooms'} left`}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={styles.stepRow}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
        <View><Text style={styles.stepTitle}>Who’s coming?</Text><Text style={styles.stepHint}>Tell us how many guests and rooms</Text></View>
      </View>
      <View style={styles.card}>
        <View style={styles.counterRow}>
          <View><Text style={styles.counterTitle}>Guests</Text><Text style={styles.counterHint}>Total people staying</Text></View>
          <View style={styles.counterControls}>
            <TouchableOpacity style={styles.counterButton} onPress={() => setGuests(String(Math.max(1, (Number(guests) || 1) - 1)))} disabled={busy}><Ionicons name="remove" size={18} color="#0F172A" /></TouchableOpacity>
            <TextInput value={guests} onChangeText={setGuests} keyboardType="number-pad" style={styles.counterValue} accessibilityLabel="Number of guests" />
            <TouchableOpacity style={styles.counterButton} onPress={() => setGuests(String((Number(guests) || 0) + 1))} disabled={busy}><Ionicons name="add" size={18} color="#0F172A" /></TouchableOpacity>
          </View>
        </View>
        <View style={styles.counterDivider} />
        <View style={styles.counterRow}>
          <View><Text style={styles.counterTitle}>Rooms</Text><Text style={styles.counterHint}>{selectedAvailability ? `${selectedAvailability.available_rooms} available for your dates` : 'Select dates and room type first'}</Text></View>
          <View style={styles.counterControls}>
            <TouchableOpacity style={styles.counterButton} onPress={() => setRooms(String(Math.max(1, (Number(rooms) || 1) - 1)))} disabled={busy}><Ionicons name="remove" size={18} color="#0F172A" /></TouchableOpacity>
            <TextInput value={rooms} onChangeText={setRooms} keyboardType="number-pad" style={styles.counterValue} accessibilityLabel="Number of rooms" />
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => setRooms(String(Math.min(selectedAvailability?.available_rooms ?? 1, (Number(rooms) || 0) + 1)))}
              disabled={busy || !selectedAvailability || roomCount >= selectedAvailability.available_rooms}
            ><Ionicons name="add" size={18} color="#0F172A" /></TouchableOpacity>
          </View>
        </View>
      </View>

      {selectedRoom && nights > 0 ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryHeading}>Price summary</Text>
          <View style={styles.summaryLine}><Text style={styles.summaryLabel}>Le {Number(selectedRoom.price_per_night).toLocaleString()} × {nights} {nights === 1 ? 'night' : 'nights'} × {Math.max(1, roomCount || 1)} {Math.max(1, roomCount || 1) === 1 ? 'room' : 'rooms'}</Text><Text style={styles.summaryAmount}>Le {totalPrice.toLocaleString()}</Text></View>
          <View style={styles.summaryTotalRow}><Text style={styles.summaryTotalLabel}>Total</Text><Text style={styles.summaryTotal}>Le {totalPrice.toLocaleString()}</Text></View>
          <Text style={styles.summaryNote}>Final amount shown in Sierra Leonean leones.</Text>
        </View>
      ) : null}

      {error ? <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color="#B42318" /><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text></View> : null}

      <TouchableOpacity
        style={[styles.confirmButton, (busy || loadingHotel || loadingAvailability || !selectedAvailability || !selectedAvailability.available_rooms) && styles.buttonDisabled]}
        onPress={() => void submit()}
        disabled={busy || loadingHotel || loadingAvailability || !selectedAvailability || !selectedAvailability.available_rooms}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="lock-closed-outline" size={19} color="#FFFFFF" />}
        <Text style={styles.confirmButtonText}>{busy ? 'Reserving your room…' : 'Confirm & continue to payment'}</Text>
      </TouchableOpacity>
      <Text style={styles.secureNote}><Ionicons name="shield-checkmark-outline" size={14} color="#64748B" />  Secure checkout · Room held for 15 minutes</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F8FA' },
  container: { paddingHorizontal: 20, gap: 14 },
  backButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingRight: 10 },
  backText: { color: '#334155', fontSize: 14, fontWeight: '600' },
  hero: { alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  heroIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#D9F0F0', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  eyebrow: { color: '#087E8B', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  heading: { marginTop: 4, color: '#102A36', fontSize: 27, fontWeight: '800' },
  subtitle: { marginTop: 4, color: '#64748B', fontSize: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 3 },
  stepNumber: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9F0F0' },
  stepNumberText: { color: '#087E8B', fontWeight: '800', fontSize: 13 },
  stepTitle: { color: '#102A36', fontWeight: '700', fontSize: 15 },
  stepHint: { color: '#7A8B94', fontSize: 11, marginTop: 1 },
  card: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E7EEF1' },
  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateField: { flex: 1 },
  fieldLabel: { color: '#81919A', letterSpacing: 1, fontSize: 9, fontWeight: '800' },
  dateInput: { paddingVertical: 9, paddingHorizontal: 0, color: '#102A36', fontSize: 15, fontWeight: '700' },
  dateDivider: { width: 1, height: 40, backgroundColor: '#E7EEF1', marginHorizontal: 14 },
  nightBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EAF7F7', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 9, marginTop: 2 },
  nightText: { color: '#087E8B', fontSize: 11, fontWeight: '700' },
  inlineHint: { color: '#B45309', fontSize: 11, marginTop: 9 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 13, backgroundColor: '#EAF7F7', padding: 12 },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, backgroundColor: '#FFFFFF', padding: 14 },
  bannerText: { color: '#49616B', fontSize: 12, flex: 1, lineHeight: 18 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 13, backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FEE4E2', padding: 12 },
  errorText: { color: '#B42318', fontSize: 12, flex: 1, lineHeight: 18 },
  roomCard: { padding: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7EEF1', borderRadius: 17 },
  roomCardSelected: { borderColor: '#087E8B', backgroundColor: '#F4FBFB' },
  roomCardSoldOut: { opacity: 0.65, backgroundColor: '#F8FAFC' },
  roomTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  roomIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#EAF7F7' },
  roomIconSelected: { backgroundColor: '#087E8B' },
  roomTitleGroup: { flex: 1 },
  roomName: { color: '#102A36', fontSize: 15, fontWeight: '700' },
  roomCapacity: { color: '#64748B', fontSize: 11, marginTop: 4 },
  roomBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#EDF2F4' },
  roomPrice: { color: '#087E8B', fontSize: 15, fontWeight: '800' },
  perNight: { color: '#81919A', fontSize: 11, fontWeight: '500' },
  availabilityPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ECFDF3', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 20 },
  soldOutPill: { backgroundColor: '#FEF3F2' },
  availabilityDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#12B76A' },
  soldOutDot: { backgroundColor: '#F04438' },
  availabilityText: { color: '#027A48', fontSize: 10, fontWeight: '700' },
  soldOutText: { color: '#B42318' },
  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counterTitle: { color: '#102A36', fontSize: 14, fontWeight: '700' },
  counterHint: { color: '#81919A', fontSize: 10, marginTop: 3 },
  counterControls: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  counterButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: '#DDE6E9', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  counterValue: { minWidth: 29, textAlign: 'center', color: '#102A36', fontSize: 15, fontWeight: '800', padding: 0 },
  counterDivider: { height: 1, backgroundColor: '#EDF2F4', marginVertical: 14 },
  summaryCard: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E7EEF1' },
  summaryHeading: { color: '#102A36', fontSize: 14, fontWeight: '800', marginBottom: 12 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  summaryLabel: { color: '#64748B', fontSize: 11, flex: 1 },
  summaryAmount: { color: '#334155', fontSize: 12, fontWeight: '600' },
  summaryTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#E7EEF1' },
  summaryTotalLabel: { color: '#102A36', fontSize: 14, fontWeight: '700' },
  summaryTotal: { color: '#087E8B', fontSize: 19, fontWeight: '800' },
  summaryNote: { color: '#81919A', fontSize: 10, marginTop: 5 },
  confirmButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#087E8B', borderRadius: 15, paddingVertical: 16, marginTop: 2, shadowColor: '#087E8B', shadowOpacity: 0.17, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  buttonDisabled: { opacity: 0.52 },
  confirmButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secureNote: { textAlign: 'center', color: '#81919A', fontSize: 10, marginTop: -5 },
});
