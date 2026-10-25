import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { getCached, invalidateCached, loadCached } from '@/lib/query-cache';
import { useAuthStore } from '@/store/auth.store';

type HotelRow = {
  id: string;
  name: string;
  city: string;
  country: string;
  location: string;
  rating: number | null;
  review_count: number | null;
  featured: boolean | null;
  description: string | null;
  cover_image: string | null;
  images: string[] | null;
  amenities: string[] | null;
  policies: string | null;
  rooms: {
    type?: string;
    price_per_night?: number | string;
    total_rooms?: number;
    capacity_guests?: number;
  }[] | null;
};

type SortMode = 'recommended' | 'price';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ query?: string | string[] }>();
  const initialQuery = typeof params.query === 'string' ? params.query : '';
  return <SearchResults key={initialQuery} initialQuery={initialQuery} />;
}

function SearchResults({ initialQuery }: { initialQuery: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useAuthStore((state: { session: { user: { id: string } } | null }) => state.session);
  const userId = session?.user?.id;
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<HotelRow[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [resultCount, setResultCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const loadResults = useCallback(async () => {
    const cacheKey = `hotels:search:${query.trim().toLowerCase()}`;
    const cached = getCached<{ rows: HotelRow[]; count: number }>(cacheKey);
    if (cached) {
      setResults(cached.rows);
      setResultCount(cached.count);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const normalizedQuery = query.trim();
      const result = await loadCached(cacheKey, async () => {
        let request = supabase
          .from('hotels')
          .select('id, name, description, location, city, country, rating, review_count, featured, cover_image, images, amenities, policies, rooms', { count: 'exact' })
          .eq('approval_status', 'approved');

        if (normalizedQuery) {
          request = request.or(
            `name.ilike.%${normalizedQuery}%,city.ilike.%${normalizedQuery}%,description.ilike.%${normalizedQuery}%`,
          );
        }

        const { data, count, error: fetchError } = await request.limit(30);
        if (fetchError) throw fetchError;
        const rows = (data ?? []) as HotelRow[];
        return { rows, count: count ?? rows.length };
      });
      setResults(result.rows);
      setResultCount(result.count);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to search hotels');
      setResults([]);
      setResultCount(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadResults();
    }, 250);

    return () => clearTimeout(timer);
  }, [loadResults]);

  useEffect(() => {
    let isCurrent = true;

    const loadFavoriteIds = async () => {
      if (!userId) {
        setFavoriteIds(new Set());
        return;
      }

      try {
        const data = await loadCached(`favorites:${userId}`, async () => {
          const { data: rows, error: fetchError } = await supabase
            .from('favorites')
            .select('hotel_id')
            .eq('user_id', userId);
          if (fetchError) throw fetchError;
          return rows ?? [];
        });
        if (isCurrent) {
          setFavoriteIds(new Set(data.map((favorite: { hotel_id: string }) => favorite.hotel_id)));
        }
      } catch (caughtError) {
        if (isCurrent) setError(caughtError instanceof Error ? caughtError.message : 'Unable to load saved stays.');
      }
    };

    void loadFavoriteIds();

    return () => {
      isCurrent = false;
    };
  }, [userId]);

  const sortedResults = useMemo(() => {
    const visible = featuredOnly ? results.filter((hotel) => hotel.featured) : [...results];

    if (sortMode === 'price') {
      visible.sort((left, right) => getLowestPrice(left) - getLowestPrice(right));
    }

    return visible;
  }, [featuredOnly, results, sortMode]);

  const toggleFavorite = async (hotel: HotelRow) => {
    if (!session?.user?.id) {
      router.push('/login');
      return;
    }

    const isSaved = favoriteIds.has(hotel.id);
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (isSaved) next.delete(hotel.id);
      else next.add(hotel.id);
      return next;
    });
    const { error: saveError } = isSaved
      ? await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('hotel_id', hotel.id)
      : await supabase.from('favorites').insert({ user_id: session.user.id, hotel_id: hotel.id });

    if (saveError) {
      setFavoriteIds((previous) => {
        const next = new Set(previous);
        if (isSaved) next.add(hotel.id);
        else next.delete(hotel.id);
        return next;
      });
      setError(saveError.message);
      return;
    }
    invalidateCached(`favorites:${session.user.id}`);
    invalidateCached(`favorite:${session.user.id}:`);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.blueHeader, { paddingTop: insets.top + 12 }]}>
        <View style={styles.searchBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={27} color="#111820" />
          </TouchableOpacity>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Where are you going?"
            placeholderTextColor="#626B75"
            style={styles.searchInput}
            accessibilityLabel="Search by city or hotel"
            returnKeyType="search"
          />
          <View style={styles.dateLabel}>
            <Text style={styles.dateText}>Add dates</Text>
          </View>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          activeOpacity={0.75}
          onPress={() => setSortMode((current) => current === 'recommended' ? 'price' : 'recommended')}
        >
          <Ionicons name="swap-vertical" size={22} color="#17212C" />
          <Text style={styles.controlLabel}>{sortMode === 'price' ? 'Price' : 'Sort'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlButton, featuredOnly && styles.controlButtonActive]}
          activeOpacity={0.75}
          onPress={() => setFeaturedOnly((current) => !current)}
        >
          <Ionicons name="options-outline" size={23} color="#17212C" />
          <Text style={styles.controlLabel}>{featuredOnly ? 'Featured' : 'Filter'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlButton}
          activeOpacity={0.75}
          onPress={() => router.push('/(tabs)/map')}
        >
          <Ionicons name="map-outline" size={23} color="#17212C" />
          <Text style={styles.controlLabel}>Map</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.resultsScroll}
        contentContainerStyle={[styles.resultsContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.summary}>
          {loading ? 'Finding stays…' : `${featuredOnly ? sortedResults.length : resultCount} propert${(featuredOnly ? sortedResults.length : resultCount) === 1 ? 'y' : 'ies'}`}
        </Text>
        {error ? (
          <>
            <Text style={styles.error}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => void loadResults()}
              accessibilityRole="button"
              disabled={loading}
            >
              <Text style={styles.retryText}>{loading ? 'Retrying…' : 'Retry'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
        {!loading && !error && sortedResults.length === 0 ? (
          <View style={styles.noResults}>
            <Ionicons name="bed-outline" size={34} color="#798899" />
            <Text style={styles.noResultsTitle}>No stays found</Text>
            <Text style={styles.noResultsText}>Try a different destination or turn off the Featured filter.</Text>
          </View>
        ) : null}

        {sortedResults.map((hotel) => {
          const price = getLowestPrice(hotel);
          const room = getCheapestRoom(hotel);
          const imageUri = hotel.cover_image || hotel.images?.find((image) => Boolean(image));
          const rating = Number(hotel.rating ?? 0);
          const ratingLabel = getRatingLabel(rating);
          const amenities = hotel.amenities ?? [];
          const beachFront = amenities.find((amenity) => /beachfront|beach front/i.test(amenity));
          const freeCancellation = /free cancellation|free cancelation|fully refundable/i.test(hotel.policies ?? '');

          return (
            <View key={hotel.id} style={styles.card}>
              <Link prefetch href={{ pathname: '/hotel/[id]', params: { id: hotel.id } }} asChild>
                <TouchableOpacity style={styles.cardMain} activeOpacity={0.92}>
                  <View style={styles.imageWrap}>
                    {imageUri ? (
                      <Image source={{ uri: imageUri }} style={styles.hotelImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.imageFallback}>
                        <Ionicons name="business-outline" size={35} color="#9BA8B6" />
                      </View>
                    )}
                  </View>
                  <View style={styles.hotelDetails}>
                    <Text style={styles.hotelName} numberOfLines={2}>{hotel.name}</Text>
                    <View style={styles.badgesRow}>
                      {hotel.featured ? (
                        <View style={styles.featuredBadge}><Text style={styles.featuredText}>Featured</Text></View>
                      ) : null}
                      {rating > 0 ? (
                        <View style={styles.stars}>
                          {Array.from({ length: Math.max(1, Math.min(5, Math.round(rating))) }, (_, index) => (
                            <Ionicons key={index} name="star" size={14} color="#F2A900" />
                          ))}
                        </View>
                      ) : null}
                    </View>

                    {rating > 0 ? (
                      <View style={styles.ratingRow}>
                        <View style={styles.ratingBox}><Text style={styles.ratingValue}>{rating.toFixed(1)}</Text></View>
                        <Text style={styles.ratingLabel}>
                          <Text style={styles.ratingLabelStrong}>{ratingLabel}</Text>
                          {hotel.review_count ? ` · ${hotel.review_count} reviews` : ''}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.detailLine}>
                      <Ionicons name="location-outline" size={17} color="#29323C" />
                      <Text style={styles.detailText} numberOfLines={1}>
                        {[hotel.city, hotel.country].filter(Boolean).join(', ') || hotel.location}
                      </Text>
                    </View>
                    {beachFront ? (
                      <View style={styles.detailLine}>
                        <Ionicons name="sunny-outline" size={17} color="#29323C" />
                        <Text style={styles.detailText} numberOfLines={1}>{beachFront}</Text>
                      </View>
                    ) : null}

                    {room ? (
                      <Text style={styles.roomDescription} numberOfLines={1}>
                        <Text style={styles.roomType}>{room.type || 'Room'}:</Text>
                        {room.capacity_guests ? ` Up to ${room.capacity_guests} guests` : ''}
                      </Text>
                    ) : null}
                    {freeCancellation ? (
                      <View style={styles.perkLine}>
                        <Ionicons name="checkmark" size={16} color="#15803D" />
                        <Text style={styles.perkText}>Free cancellation</Text>
                      </View>
                    ) : null}
                    {room?.total_rooms ? (
                      <Text style={styles.availability}>{room.total_rooms} {room.total_rooms === 1 ? 'room' : 'rooms'} available</Text>
                    ) : null}
                    <View style={styles.priceBlock}>
                      <Text style={styles.price}>
                        {price < Number.MAX_SAFE_INTEGER ? `Le ${price.toLocaleString()}` : 'Price on request'}
                      </Text>
                      {price < Number.MAX_SAFE_INTEGER ? <Text style={styles.priceCaption}>per night · taxes may apply</Text> : null}
                    </View>
                  </View>
                </TouchableOpacity>
              </Link>
              <TouchableOpacity
                style={styles.favoriteButton}
                onPress={() => void toggleFavorite(hotel)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={favoriteIds.has(hotel.id) ? `Remove ${hotel.name} from saved stays` : `Save ${hotel.name}`}
              >
                <Ionicons
                  name={favoriteIds.has(hotel.id) ? 'heart' : 'heart-outline'}
                  size={25}
                  color={favoriteIds.has(hotel.id) ? '#C9233A' : '#17212C'}
                />
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function getCheapestRoom(hotel: HotelRow) {
  return (hotel.rooms ?? [])
    .filter((room) => Number(room.price_per_night ?? 0) > 0)
    .sort((left, right) => Number(left.price_per_night) - Number(right.price_per_night))[0];
}

function getLowestPrice(hotel: HotelRow) {
  const room = getCheapestRoom(hotel);
  return room ? Number(room.price_per_night) : Number.MAX_SAFE_INTEGER;
}

function getRatingLabel(rating: number) {
  if (rating >= 4.5) return 'Exceptional';
  if (rating >= 4) return 'Excellent';
  if (rating >= 3.5) return 'Very good';
  if (rating >= 3) return 'Good';
  return 'Rated';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  blueHeader: {
    backgroundColor: '#0B4AA8',
    paddingHorizontal: 16,
    paddingBottom: 15,
  },
  searchBar: {
    minHeight: 64,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: '#F5B400',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  backButton: {
    width: 36,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: '#18212B',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  dateLabel: {
    borderLeftWidth: 1,
    borderLeftColor: '#E3E6E9',
    paddingLeft: 10,
    paddingVertical: 8,
  },
  dateText: {
    color: '#18212B',
    fontSize: 14,
    fontWeight: '600',
  },
  controls: {
    minHeight: 62,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EBEF',
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
  },
  controlButtonActive: {
    backgroundColor: '#EEF4FC',
  },
  controlLabel: {
    color: '#171C22',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  resultsContent: {
    paddingTop: 17,
  },
  summary: {
    color: '#29323C',
    fontSize: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  error: {
    color: '#B42318',
    fontSize: 14,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginHorizontal: 18,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#087E8B',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  noResults: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 50,
  },
  noResultsTitle: {
    color: '#1C2732',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  noResultsText: {
    color: '#667586',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  card: {
    minHeight: 245,
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE1E5',
    backgroundColor: '#FFFFFF',
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
  },
  imageWrap: {
    width: '38%',
    minHeight: 218,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#EDF1F5',
  },
  hotelImage: {
    width: '100%',
    height: '100%',
    minHeight: 218,
  },
  imageFallback: {
    flex: 1,
    minHeight: 218,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF0F6',
  },
  hotelDetails: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 14,
    alignItems: 'flex-start',
  },
  hotelName: {
    color: '#17191D',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    paddingRight: 3,
  },
  badgesRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 3,
  },
  featuredBadge: {
    borderWidth: 1,
    borderColor: '#9AA2AA',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  featuredText: {
    color: '#353A40',
    fontSize: 11,
    fontWeight: '600',
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    marginBottom: 6,
    gap: 8,
  },
  ratingBox: {
    minWidth: 40,
    minHeight: 38,
    borderRadius: 7,
    backgroundColor: '#0B4AA8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  ratingValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  ratingLabel: {
    color: '#60666D',
    fontSize: 13,
    flexShrink: 1,
  },
  ratingLabelStrong: {
    color: '#20262D',
    fontWeight: '600',
  },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  detailText: {
    color: '#29323C',
    fontSize: 13,
    flexShrink: 1,
  },
  roomDescription: {
    color: '#29323C',
    fontSize: 13,
    marginTop: 9,
  },
  roomType: {
    fontWeight: '700',
  },
  perkLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  perkText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
  },
  availability: {
    color: '#16803C',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  priceBlock: {
    width: '100%',
    alignItems: 'flex-end',
    marginTop: 'auto',
    paddingTop: 12,
  },
  price: {
    color: '#16191E',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'right',
  },
  priceCaption: {
    color: '#666C73',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 2,
  },
  favoriteButton: {
    position: 'absolute',
    top: 15,
    right: 16,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
});
