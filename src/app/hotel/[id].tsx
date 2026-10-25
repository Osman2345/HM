import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { invalidateCached, loadCached } from '@/lib/query-cache';
import { useAuthStore } from '@/store/auth.store';

type HotelRow = {
  id: string;
  name: string;
  city: string;
  country: string;
  description: string | null;
  cover_image: string | null;
  images: string[] | null;
  amenities: string[] | null;
  rooms: {
    type?: string;
    price_per_night?: number | string;
    total_rooms?: number;
    images?: string[];
  }[] | null;
  rating: number | null;
  policies: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
};

export default function HotelDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const hotelId = Array.isArray(params.id) ? params.id[0] : params.id;
  const session = useAuthStore((state: { session: { user: { id: string } } | null }) => state.session);
  const userId = session?.user?.id;
  const [hotel, setHotel] = useState<HotelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let timedOut = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);

    const loadHotel = async () => {
      setLoading(true);
      setError(null);
      setHotel(null);
      setFavorite(false);

      try {
        if (!hotelId) {
          throw new Error('The hotel link is missing its listing ID.');
        }

        const data = await loadCached(`hotel:${hotelId}`, async () => {
          const { data: hotelData, error: fetchError } = await supabase
            .from('hotels')
            .select('id, name, city, country, description, cover_image, images, amenities, rooms, rating, policies, check_in_time, check_out_time')
            .eq('id', hotelId)
            .abortSignal(controller.signal)
            .maybeSingle();

          if (fetchError) throw fetchError;
          return hotelData as HotelRow | null;
        }, 20000);

        if (!active) return;
        setHotel(data);

        if (userId && data) {
          void loadCached(`favorite:${userId}:${data.id}`, async () => {
            const { data: favoriteData, error: favoriteError } = await supabase
              .from('favorites')
              .select('id')
              .eq('user_id', userId)
              .eq('hotel_id', data.id)
              .maybeSingle();
            if (favoriteError) throw favoriteError;
            return Boolean(favoriteData);
          }).then((isFavorite) => {
              if (!active) return;
              setFavorite(isFavorite);
            }).catch((favoriteError: unknown) => {
              if (active) {
                console.error('Unable to load hotel favorite status:', favoriteError instanceof Error ? favoriteError.message : favoriteError);
              }
            });
        } else {
          setFavorite(false);
        }
      } catch (caughtError) {
        if (active) {
          setError(timedOut
            ? 'Loading this hotel timed out. Check your connection and try again.'
            : caughtError instanceof Error ? caughtError.message : 'Unable to load hotel.');
        }
      } finally {
        clearTimeout(timeout);
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadHotel();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [hotelId, reloadKey, userId]);

  const toggleFavorite = async () => {
    if (!hotel || !session?.user?.id) {
      return;
    }

    if (favorite) {
      setFavorite(false);
      const { error: favoriteError } = await supabase.from('favorites').delete().eq('hotel_id', hotel.id).eq('user_id', session.user.id);
      if (favoriteError) {
        setFavorite(true);
        setError(favoriteError.message);
        return;
      }
      invalidateCached(`favorite:${session.user.id}:${hotel.id}`);
      invalidateCached(`favorites:${session.user.id}`);
      return;
    }

    setFavorite(true);
    const { error: favoriteError } = await supabase.from('favorites').insert({ hotel_id: hotel.id, user_id: session.user.id });
    if (favoriteError) {
      setFavorite(false);
      setError(favoriteError.message);
      return;
    }
    invalidateCached(`favorite:${session.user.id}:${hotel.id}`);
    invalidateCached(`favorites:${session.user.id}`);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.center}>Loading hotel…</Text>
      </View>
    );
  }

  if (error || !hotel) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.center}>{error ?? 'Hotel not found'}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.retryButton}
          onPress={() => setReloadKey((current) => current + 1)}
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const startBooking = () => {
    if (session?.user?.id) {
      router.push({ pathname: '/booking/new', params: { hotelId: hotel.id } });
      return;
    }

    router.push({ pathname: '/login', params: { bookingHotelId: hotel.id } });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {hotel.cover_image ? <Image source={{ uri: hotel.cover_image }} style={styles.cover} resizeMode="cover" /> : null}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{hotel.name}</Text>
          <Text style={styles.meta}>{hotel.city}, {hotel.country}</Text>
        </View>
        <TouchableOpacity style={styles.favoriteButton} onPress={() => void toggleFavorite()}>
          <Text>{favorite ? '♥' : '♡'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <Text style={styles.description}>{hotel.description}</Text>
      <Text style={styles.rating}>⭐ {hotel.rating ?? 'New'}</Text>

      <Text style={styles.sectionTitle}>Amenities</Text>
      <View style={styles.chipWrap}>
        {(hotel.amenities ?? []).map((amenity) => (
          <View key={amenity} style={styles.chip}>
            <Text style={styles.chipText}>{amenity}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Rooms</Text>
      {(hotel.rooms ?? []).map((room, index) => (
        <View key={`${hotel.id}-${room.type ?? 'room'}-${index}`} style={styles.roomCard}>
          <Text style={styles.roomType}>{room.type ?? 'Room'}</Text>
          {room.images?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomImages}>
              {room.images.map((image, imageIndex) => (
                <Image
                  key={`${image}-${imageIndex}`}
                  source={{ uri: image }}
                  style={styles.roomImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : null}
          <Text style={styles.roomMeta}>{room.total_rooms ?? 0} rooms in this room type · availability depends on your dates</Text>
          <Text style={styles.roomPrice}>Le {Number(room.price_per_night ?? 0).toLocaleString()}/night</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Policies</Text>
      <Text style={styles.description}>{hotel.policies ?? 'Flexible cancellation and check-in policy.'}</Text>
      <Text style={styles.meta}>Check-in: {hotel.check_in_time ?? '14:00'} • Check-out: {hotel.check_out_time ?? '11:00'}</Text>

      <TouchableOpacity style={styles.ctaButton} onPress={startBooking}>
        <Text style={styles.ctaText}>Book this hotel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    gap: 12,
  },
  cover: {
    width: '100%',
    height: 220,
    borderRadius: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  meta: {
    color: '#475569',
    marginTop: 4,
  },
  favoriteButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    marginTop: 8,
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 18,
  },
  description: {
    color: '#475569',
    lineHeight: 22,
  },
  rating: {
    fontWeight: '700',
    color: '#0F172A',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  roomCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
  },
  roomImages: {
    marginTop: 10,
  },
  roomImage: {
    width: 150,
    height: 100,
    borderRadius: 8,
    marginRight: 8,
  },
  roomType: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  roomMeta: {
    marginTop: 4,
    color: '#475569',
  },
  roomPrice: {
    marginTop: 8,
    color: '#2563EB',
    fontWeight: '700',
  },
  ctaButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  center: {
    textAlign: 'center',
    marginTop: 40,
    color: '#475569',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  retryButton: {
    marginTop: 18,
    minWidth: 150,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#087E8B',
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  backButton: {
    marginTop: 8,
    minWidth: 150,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#087E8B',
    fontWeight: '700',
  },
});
