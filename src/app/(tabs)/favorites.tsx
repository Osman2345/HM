import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { invalidateCached } from '@/lib/query-cache';
import { useAuthStore } from '@/store/auth.store';

type SavedHotel = {
  id: string;
  name: string;
  city: string;
  country: string;
  location: string;
  rating: number | null;
  cover_image: string | null;
  images: string[] | null;
  rooms: { price_per_night?: number | string }[] | null;
};

type FavoriteRow = {
  favorite_id: string;
  hotel_id: string;
  name: string;
  city: string;
  country: string;
  location: string;
  rating: number;
  cover_image: string | null;
  images: string[] | null;
  rooms: { price_per_night?: number | string }[] | null;
};

export default function FavoritesScreen() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.session?.user.id);
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadFavorites = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);

    if (!userId) {
      setFavorites([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error: favoritesError } = await supabase.rpc('get_my_saved_hotels');
      if (favoritesError) throw favoritesError;
      setFavorites((data ?? []) as FavoriteRow[]);
    } catch (caughtError) {
      const message = typeof caughtError === 'object' && caughtError !== null && 'message' in caughtError
        && typeof caughtError.message === 'string'
        ? caughtError.message
        : 'Unable to load your saved stays.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadFavorites();
  }, [loadFavorites]));

  const removeFavorite = async (favorite: FavoriteRow) => {
    if (!userId || removingId) return;

    setRemovingId(favorite.favorite_id);
    setError(null);
    const { error: deleteError } = await supabase
      .from('favorites')
      .delete()
      .eq('id', favorite.favorite_id)
      .eq('user_id', userId);

    if (deleteError) {
      setError(deleteError.message);
      setRemovingId(null);
      return;
    }

    setFavorites((current) => current.filter((item) => item.favorite_id !== favorite.favorite_id));
    invalidateCached(`favorites:${userId}`);
    invalidateCached(`favorite:${userId}:`);
    setRemovingId(null);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFavorites(true)} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>YOUR TRAVEL</Text>
            <Text style={styles.title}>Saved stays</Text>
            <Text style={styles.subtitle}>The places you love, all in one place.</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="heart" size={22} color="#087E8B" />
          </View>
        </View>

        {!userId ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="heart-outline" size={29} color="#087E8B" />
            </View>
            <Text style={styles.emptyTitle}>Save stays you love</Text>
            <Text style={styles.emptyText}>Sign in to keep your favourite hotels together and find them again anytime.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/login')} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Sign in</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={() => router.push('/search')} accessibilityRole="button">
              <Text style={styles.textButtonText}>Explore stays first</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {userId && loading ? (
          <View style={styles.stateCard}>
            <Ionicons name="hourglass-outline" size={22} color="#087E8B" />
            <Text style={styles.stateText}>Loading your saved stays…</Text>
          </View>
        ) : null}

        {userId && error ? (
          <View style={styles.errorCard}>
            <View style={styles.errorIcon}><Ionicons name="alert-circle-outline" size={19} color="#B42318" /></View>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Saved stays unavailable</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={() => void loadFavorites()} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {userId && !loading && !error && favorites.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="heart-outline" size={29} color="#087E8B" />
            </View>
            <Text style={styles.emptyTitle}>Your saved stays start here</Text>
            <Text style={styles.emptyText}>Tap the heart on any hotel to save it here for later.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/search')} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Explore stays</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : null}

        {userId && !loading && favorites.length > 0 ? (
          <View style={styles.list}>
            <View style={styles.listHeading}>
              <View>
                <Text style={styles.listTitle}>Your favourites</Text>
                <Text style={styles.listSubtitle}>
                  {favorites.length} saved stay{favorites.length === 1 ? '' : 's'}
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

            {favorites.map((favorite) => {
              const hotel: SavedHotel = { ...favorite, id: favorite.hotel_id };
              const imageUri = hotel.cover_image || hotel.images?.find(Boolean);
              const cheapestPrice = (hotel.rooms ?? [])
                .map((room) => Number(room.price_per_night ?? 0))
                .filter((price) => price > 0)
                .sort((left, right) => left - right)[0];
              const location = [hotel.city, hotel.country].filter(Boolean).join(', ') || hotel.location;

              return (
                <View key={favorite.favorite_id} style={styles.favoriteCard}>
                  <Link href={{ pathname: '/hotel/[id]', params: { id: hotel.id } }} asChild>
                    <TouchableOpacity style={styles.cardMain} activeOpacity={0.85}>
                      {imageUri ? (
                        <Image source={{ uri: imageUri }} style={styles.hotelImage} resizeMode="cover" />
                      ) : (
                        <View style={[styles.hotelImage, styles.imageFallback]}>
                          <Ionicons name="bed-outline" size={25} color="#087E8B" />
                        </View>
                      )}
                      <View style={styles.hotelDetails}>
                        <Text style={styles.hotelName} numberOfLines={1}>{hotel.name}</Text>
                        <Text style={styles.hotelLocation} numberOfLines={1}>
                          <Ionicons name="location-outline" size={12} color="#82939B" /> {location}
                        </Text>
                        <View style={styles.hotelFooter}>
                          <View style={styles.rating}>
                            <Ionicons name="star" size={13} color="#E8A934" />
                            <Text style={styles.ratingText}>{hotel.rating ? Number(hotel.rating).toFixed(1) : 'New'}</Text>
                          </View>
                          {cheapestPrice ? (
                            <Text style={styles.price}>Le {cheapestPrice.toLocaleString()}<Text style={styles.priceUnit}> / night</Text></Text>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Link>
                  <TouchableOpacity
                    style={styles.removeButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${hotel.name} from saved stays`}
                    disabled={removingId === favorite.favorite_id}
                    onPress={() => void removeFavorite(favorite)}
                  >
                    <Ionicons
                      name={removingId === favorite.favorite_id ? 'hourglass-outline' : 'heart'}
                      size={21}
                      color="#C83C4B"
                    />
                  </TouchableOpacity>
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
  favoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E8EFF0',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  hotelImage: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#EAF5F4',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotelDetails: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  hotelName: {
    color: '#17354B',
    fontSize: 13,
    fontWeight: '800',
  },
  hotelLocation: {
    color: '#82939B',
    fontSize: 10,
  },
  hotelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 3,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: '#526974',
    fontSize: 10,
    fontWeight: '700',
  },
  price: {
    color: '#087E8B',
    fontSize: 11,
    fontWeight: '900',
  },
  priceUnit: {
    color: '#819199',
    fontSize: 9,
    fontWeight: '500',
  },
  removeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFF1F1',
  },
  stateCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
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
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0D6D3',
  },
  errorIcon: {
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#FDEAE8',
  },
  errorCopy: {
    flex: 1,
  },
  errorTitle: {
    color: '#8E302A',
    fontSize: 11,
    fontWeight: '800',
  },
  errorText: {
    color: '#9C6863',
    fontSize: 10,
    marginTop: 3,
  },
  retryButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#EAF5F4',
  },
  retryText: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EFF0',
  },
  emptyIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#EAF5F4',
  },
  emptyTitle: {
    color: '#17354B',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 16,
  },
  emptyText: {
    maxWidth: 330,
    color: '#819199',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
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
});
