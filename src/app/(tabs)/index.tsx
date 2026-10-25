import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { loadCached } from '@/lib/query-cache';
import { useAuthStore } from '@/store/auth.store';

type HotelRow = {
  id: string;
  name: string;
  city: string;
  rating: number | null;
  cover_image: string | null;
  description: string | null;
  rooms: { price_per_night?: number | string }[] | null;
};

const popularCities = ['Freetown', 'Bo', 'Makeni', 'Kenema'];

export default function HomeScreen() {
  const router = useRouter();
  const session = useAuthStore((state: { session: { user: { id: string } } | null }) => state.session);
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [destination, setDestination] = useState('');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState({ userId: null as string | null, count: 0 });
  const unreadNotifications = session?.user?.id === unreadNotificationCount.userId ? unreadNotificationCount.count : 0;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHotels = useCallback(() => loadCached('hotels:home', async () => {
    const { data: rows, error: fetchError } = await supabase
      .from('hotels')
      .select('id, name, city, rating, cover_image, description, rooms')
      .eq('approval_status', 'approved')
      .limit(6);

    if (fetchError) throw fetchError;
    return (rows ?? []) as HotelRow[];
  }), []);

  useEffect(() => {
    let active = true;

    const loadHotels = async () => {
      try {
        const data = await fetchHotels();
        if (active) {
          setHotels(data);
          setError(null);
        }
      } catch (caughtError) {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : 'Unable to load hotels');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadHotels();
    return () => {
      active = false;
    };
  }, [fetchHotels]);

  const retryHotels = async () => {
    setLoading(true);
    setError(null);
    try {
      setHotels(await fetchHotels());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load hotels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      return;
    }

    let active = true;
    let fallbackInterval: ReturnType<typeof setInterval> | undefined;

    const stopFallbackPolling = () => {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = undefined;
      }
    };

    const loadUnreadCount = async () => {
      const { count, error: fetchError } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (fetchError) {
        console.error('Unable to load unread notification count:', fetchError.message);
        return;
      }

      if (active) {
        setUnreadNotificationCount({ userId, count: count ?? 0 });
      }
    };

    void loadUnreadCount();
    const channelTopic = `home-notifications-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelTopic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void loadUnreadCount();
      })
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          stopFallbackPolling();
          fallbackInterval = setInterval(() => {
            void loadUnreadCount();
          }, 15000);
        }
      });

    return () => {
      active = false;
      stopFallbackPolling();
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const searchFor = (query: string) => {
    router.push({ pathname: '/search', params: query.trim() ? { query: query.trim() } : {} });
  };

  const renderHotelCard = (hotel: HotelRow) => {
    const lowestPrice = Array.isArray(hotel.rooms)
      ? hotel.rooms.reduce((min, room) => {
          const roomPrice = Number(room?.price_per_night ?? 0);
          return roomPrice > 0 && roomPrice < min ? roomPrice : min;
        }, Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;

    const price = lowestPrice === Number.MAX_SAFE_INTEGER ? null : `Le ${Number(lowestPrice).toLocaleString()}`;

    return (
      <Link prefetch key={hotel.id} href={{ pathname: '/hotel/[id]', params: { id: hotel.id } }} asChild>
        <TouchableOpacity style={styles.hotelCard} activeOpacity={0.92}>
          <View style={styles.hotelPhotoWrap}>
            {hotel.cover_image ? (
              <Image source={{ uri: hotel.cover_image }} style={styles.hotelImage} resizeMode="cover" />
            ) : (
              <View style={[styles.hotelImage, styles.imageFallback]}>
                <Ionicons name="bed-outline" size={42} color="#8BA5B8" />
              </View>
            )}
            <View style={styles.stayBadge}>
              <Ionicons name="sparkles" size={12} color="#925D10" />
              <Text style={styles.stayBadgeText}>LOCAL STAY</Text>
            </View>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={13} color="#F2B544" />
              <Text style={styles.ratingText}>{hotel.rating ?? 'New'}</Text>
            </View>
          </View>
          <View style={styles.hotelDetails}>
            <View style={styles.hotelTitleRow}>
              <View style={styles.hotelTitleBlock}>
                <Text style={styles.hotelName} numberOfLines={1}>{hotel.name}</Text>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={15} color="#718397" />
                  <Text style={styles.hotelCity}>{hotel.city}</Text>
                </View>
              </View>
              {price ? (
                <View style={styles.priceBlock}>
                  <Text style={styles.price}>{price}</Text>
                  <Text style={styles.priceUnit}>per night</Text>
                </View>
              ) : null}
            </View>
            {hotel.description ? (
              <Text style={styles.description} numberOfLines={2}>{hotel.description}</Text>
            ) : null}
            <View style={styles.cardDivider} />
            <View style={styles.cardLinkRow}>
              <Text style={styles.viewStay}>View stay</Text>
              <Ionicons name="arrow-forward" size={16} color="#087E8B" />
            </View>
          </View>
        </TouchableOpacity>
      </Link>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}>
            <Ionicons name="bed" size={21} color="#FFFFFF" />
            <View style={styles.brandMarkDot} />
          </View>
          <View>
            <Text style={styles.brandName}>SL <Text style={styles.brandNameAccent}>STAY</Text></Text>
            <Text style={styles.brandTagline}>FIND YOUR PLACE</Text>
          </View>
        </View>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.accountButton}
            onPress={() => router.push('/notifications')}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={unreadNotifications > 0
              ? `${unreadNotifications} unread notifications`
              : 'Open notifications'}
          >
            <Ionicons name="notifications-outline" size={20} color="#17354B" />
            {unreadNotifications > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.accountButton}
            onPress={() => router.navigate('/(tabs)/profile')}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open your account"
          >
            <Ionicons name="person-outline" size={20} color="#17354B" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroOrb} />
        <View style={styles.heroEyebrow}>
          <View style={styles.heroEyebrowLine} />
          <Text style={styles.heroEyebrowText}>THE BEST OF SIERRA LEONE</Text>
        </View>
        <Text style={styles.heroTitle}>A stay that feels{'\n'}like <Text style={styles.heroTitleAccent}>your own.</Text></Text>
        <Text style={styles.heroSubtitle}>Find a lovely place to stay, wherever the road takes you.</Text>

        <View style={styles.searchPanel}>
          <View style={styles.searchInputRow}>
            <Ionicons name="location-outline" size={21} color="#087E8B" />
            <TextInput
              value={destination}
              onChangeText={setDestination}
              onSubmitEditing={() => searchFor(destination)}
              returnKeyType="search"
              placeholder="Where do you want to stay?"
              placeholderTextColor="#8695A3"
              style={styles.searchInput}
              accessibilityLabel="Search by destination"
            />
            {destination.length > 0 ? (
              <TouchableOpacity onPress={() => setDestination('')} accessibilityLabel="Clear destination">
                <Ionicons name="close-circle" size={19} color="#99A6B1" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={styles.searchButton} onPress={() => searchFor(destination)} activeOpacity={0.85}>
            <Ionicons name="search" size={19} color="#FFFFFF" />
            <Text style={styles.searchButtonText}>Find a stay</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.citySection}>
        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.sectionEyebrow}>START EXPLORING</Text>
            <Text style={styles.sectionTitle}>Popular places</Text>
          </View>
          <Ionicons name="compass-outline" size={25} color="#087E8B" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cityList}>
          {popularCities.map((city, index) => (
            <TouchableOpacity key={city} style={styles.cityChip} onPress={() => searchFor(city)}>
              <Ionicons
                name={index === 0 ? 'sunny-outline' : 'location-outline'}
                size={15}
                color={index === 0 ? '#B77A1C' : '#087E8B'}
              />
              <Text style={styles.cityChipText}>{city}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.staysSection}>
        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.sectionEyebrow}>HANDPICKED FOR YOU</Text>
            <Text style={styles.sectionTitle}>Stays to discover</Text>
          </View>
          <TouchableOpacity style={styles.seeAllButton} onPress={() => searchFor('')}>
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="arrow-forward" size={15} color="#087E8B" />
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={styles.emptyState}>
            <Ionicons name="bed-outline" size={24} color="#8BA5B8" />
            <Text style={styles.state}>Finding lovely places to stay…</Text>
          </View>
        ) : null}
        {error ? (
          <View>
            <Text style={styles.error}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => void retryHotels()}
              accessibilityRole="button"
              disabled={loading}
            >
              <Text style={styles.retryText}>{loading ? 'Retrying…' : 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!loading && !error && hotels.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="home-outline" size={26} color="#8BA5B8" />
            <Text style={styles.state}>New stays are on their way.</Text>
          </View>
        ) : null}
        {!loading && hotels.length > 0 ? hotels.map(renderHotelCard) : null}
      </View>

      <View style={styles.footerNote}>
        <Ionicons name="heart" size={14} color="#D48A40" />
        <Text style={styles.footerText}>Stay local. Feel at home.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  container: {
    paddingBottom: 24,
  },
  topBar: {
    minHeight: 74,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#087E8B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkDot: {
    position: 'absolute',
    right: 7,
    top: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F2B544',
  },
  brandName: {
    color: '#17354B',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  brandNameAccent: {
    color: '#087E8B',
  },
  brandTagline: {
    marginTop: 1,
    color: '#82909B',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  accountButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F5F5',
    borderWidth: 1,
    borderColor: '#E0E9E9',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C84440',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  hero: {
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 24,
    backgroundColor: '#123A50',
  },
  heroOrb: {
    position: 'absolute',
    right: -68,
    top: -97,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#1B5363',
    opacity: 0.56,
  },
  heroEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroEyebrowLine: {
    width: 20,
    height: 2,
    backgroundColor: '#F2B544',
  },
  heroEyebrowText: {
    color: '#D4E2E6',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  heroTitle: {
    marginTop: 15,
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  heroTitleAccent: {
    color: '#F2B544',
  },
  heroSubtitle: {
    maxWidth: 300,
    marginTop: 9,
    color: '#D2E0E4',
    fontSize: 14,
    lineHeight: 21,
  },
  searchPanel: {
    marginTop: 23,
    padding: 7,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    gap: 7,
  },
  searchInputRow: {
    minHeight: 48,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    color: '#17354B',
    fontSize: 14,
  },
  searchButton: {
    minHeight: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#087E8B',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  citySection: {
    paddingTop: 25,
  },
  sectionHeadingRow: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionEyebrow: {
    color: '#82909B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionTitle: {
    marginTop: 4,
    color: '#17354B',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cityList: {
    paddingHorizontal: 20,
    paddingTop: 13,
    paddingBottom: 2,
    gap: 9,
  },
  cityChip: {
    minHeight: 37,
    paddingHorizontal: 13,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4EAEB',
  },
  cityChipText: {
    color: '#415666',
    fontSize: 12,
    fontWeight: '600',
  },
  staysSection: {
    paddingTop: 27,
    gap: 12,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  seeAllText: {
    color: '#087E8B',
    fontSize: 13,
    fontWeight: '700',
  },
  hotelCard: {
    marginHorizontal: 20,
    overflow: 'hidden',
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6EBEC',
    boxShadow: '0px 3px 10px rgba(25, 56, 73, 0.06)',
    elevation: 2,
  },
  hotelPhotoWrap: {
    height: 192,
    position: 'relative',
    backgroundColor: '#E8EFF0',
  },
  hotelImage: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7EFF0',
  },
  stayBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E9',
  },
  stayBadgeText: {
    color: '#80591D',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  ratingBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
  },
  ratingText: {
    color: '#17354B',
    fontSize: 12,
    fontWeight: '800',
  },
  hotelDetails: {
    padding: 14,
  },
  hotelTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  hotelTitleBlock: {
    flex: 1,
  },
  hotelName: {
    color: '#17354B',
    fontSize: 17,
    fontWeight: '800',
  },
  locationRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  hotelCity: {
    color: '#718397',
    fontSize: 12,
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  price: {
    color: '#087E8B',
    fontSize: 16,
    fontWeight: '800',
  },
  priceUnit: {
    marginTop: 2,
    color: '#87939D',
    fontSize: 10,
  },
  description: {
    marginTop: 11,
    color: '#667783',
    fontSize: 12,
    lineHeight: 18,
  },
  cardDivider: {
    height: 1,
    marginTop: 13,
    backgroundColor: '#EDF0F0',
  },
  cardLinkRow: {
    paddingTop: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewStay: {
    color: '#087E8B',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    marginHorizontal: 20,
    minHeight: 95,
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6EBEC',
  },
  state: {
    color: '#718397',
    fontSize: 13,
  },
  error: {
    marginHorizontal: 20,
    color: '#B42318',
    fontSize: 13,
  },
  retryButton: {
    alignSelf: 'center',
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: '#087E8B',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  footerNote: {
    paddingTop: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: {
    color: '#718397',
    fontSize: 11,
    fontWeight: '600',
  },
});
