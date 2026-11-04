import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { supabase } from '@/lib/supabase';
import { invalidateCached, loadCached } from '@/lib/query-cache';
import HotelDetailSkeleton from '@/components/skeletons/HotelDetailSkeleton';
import useDelayedLoading from '@/hooks/useDelayedLoading';
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
    capacity_guests?: number;
    images?: string[];
  }[] | null;
  rating: number | null;
  review_count: number | null;
  policies: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function HotelDetailsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktopWeb = Platform.OS === 'web' && width >= 960;
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const hotelId = Array.isArray(params.id) ? params.id[0] : params.id;
  const session = useAuthStore((state: { session: { user: { id: string } } | null }) => state.session);
  const userId = session?.user?.id;
  const [hotel, setHotel] = useState<HotelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [gallery, setGallery] = useState<{ title: string; images: string[]; index: number } | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [heroIndex, setHeroIndex] = useState(0);
  const showSkeleton = useDelayedLoading(loading);
  const contentScrollRef = useRef<ScrollView | null>(null);
  const sectionPositions = useRef<Record<string, number>>({});
  const heroIndexRef = useRef(0);
  const heroOpacity = useRef(new Animated.Value(1)).current;
  const heroTranslateX = useRef(new Animated.Value(0)).current;
  const hotelPhotos = useMemo(() => [...new Set([hotel?.cover_image, ...(hotel?.images ?? [])]
    .filter((image): image is string => typeof image === 'string' && image.trim().length > 0))], [hotel?.cover_image, hotel?.images]);

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
            .select('id, name, city, country, description, cover_image, images, amenities, rooms, rating, review_count, policies, check_in_time, check_out_time, latitude, longitude')
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

  useEffect(() => {
    heroIndexRef.current = 0;
    setHeroIndex(0);
  }, [hotelId]);

  useEffect(() => {
    if (hotelPhotos.length < 2 || gallery) {
      return;
    }

    const interval = setInterval(() => {
      const nextIndex = (heroIndexRef.current + 1) % hotelPhotos.length;
      heroIndexRef.current = nextIndex;
      setHeroIndex(nextIndex);
      heroOpacity.setValue(0.72);
      heroTranslateX.setValue(22);
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(heroTranslateX, { toValue: 0, duration: 480, useNativeDriver: true }),
      ]).start();
    }, 4800);

    return () => clearInterval(interval);
  }, [gallery, heroOpacity, heroTranslateX, hotelPhotos.length]);

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

  const openHotelLocation = () => {
    if (!hotel) {
      return;
    }

    router.push({ pathname: '/map', params: { hotelId: hotel.id } });
  };

  if (loading) {
    return showSkeleton ? <HotelDetailSkeleton /> : <View style={styles.screen} />;
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
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <Text style={styles.backText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const startBooking = (roomType?: string) => {
    if (!session?.user?.id) {
      router.push({ pathname: '/login', params: { bookingHotelId: hotel.id } });
      return;
    }

    router.push({
      pathname: '/booking/new',
      params: {
        hotelId: hotel.id,
        roomType: roomType ?? '',
      },
    });
  };

  const openPhotoGallery = (images: string[], title: string, index = 0) => {
    const validImages = images.filter((image) => typeof image === 'string' && image.trim().length > 0);
    if (validImages.length) {
      setGallery({ title, images: validImages, index: Math.max(0, Math.min(index, validImages.length - 1)) });
    }
  };

  const moveGallery = (direction: -1 | 1) => {
    setGallery((current) => current ? {
      ...current,
      index: (current.index + direction + current.images.length) % current.images.length,
    } : current);
  };

    const scrollToSection = (section: string) => {
      setActiveSection(section);
      const position = sectionPositions.current[section];
      if (typeof position === 'number') {
        contentScrollRef.current?.scrollTo({ y: Math.max(0, position - 12), animated: true });
      }
    };

    const sectionTabs = [
      { id: 'overview', label: 'Overview' },
      { id: 'rooms', label: 'Rooms' },
      { id: 'facilities', label: 'Facilities' },
      { id: 'policies', label: 'Policies' },
      { id: 'reviews', label: 'Guest reviews' },
    ];

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backNavButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#17354B" />
        </TouchableOpacity>

        <View style={styles.brandLockup}>
          <View style={styles.brandMark}>
            <Ionicons name="bed" size={20} color="#FFFFFF" />
            <View style={styles.brandMarkDot} />
          </View>
          <View>
            <Text style={styles.brandName}>SL <Text style={styles.brandNameAccent}>STAY</Text></Text>
            <Text style={styles.brandTagline}>FIND YOUR PLACE</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={() => void toggleFavorite()}
          accessibilityRole="button"
          accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Text style={styles.favoriteIcon}>{favorite ? '♥' : '♡'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={contentScrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, desktopWeb && styles.contentWeb]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.breadcrumbs}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} accessibilityRole="link"><Text style={styles.breadcrumbLink}>Home</Text></TouchableOpacity>
          <Ionicons name="chevron-forward" size={12} color="#82909B" />
          <TouchableOpacity onPress={() => router.replace('/(tabs)/search')} accessibilityRole="link"><Text style={styles.breadcrumbLink}>Hotels</Text></TouchableOpacity>
          <Ionicons name="chevron-forward" size={12} color="#82909B" />
          <Text style={styles.breadcrumbCurrent} numberOfLines={1}>{hotel.city}</Text>
          <Ionicons name="chevron-forward" size={12} color="#82909B" />
          <Text style={styles.breadcrumbCurrent} numberOfLines={1}>{hotel.name}</Text>
        </View>

        <View style={[styles.hotelHeadingRow, desktopWeb && styles.hotelHeadingRowWeb]}>
          <View style={styles.hotelHeadingCopy}>
            <Text style={styles.stars}>{hotel.rating ? '★'.repeat(Math.max(1, Math.min(5, Math.round(hotel.rating)))) : 'NEW LISTING'}</Text>
            <Text style={styles.name}>{hotel.name}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color="#087E8B" />
              <Text style={styles.meta}>{hotel.city}, {hotel.country}</Text>
              <Text style={styles.locationSeparator}>·</Text>
              <TouchableOpacity onPress={() => void openHotelLocation()} accessibilityRole="button">
                <Text style={styles.inlineMapLink}>Show on map</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.headingActions}>
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={() => void toggleFavorite()}
              accessibilityRole="button"
              accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={21} color="#087E8B" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.reserveButton} onPress={() => startBooking()} accessibilityRole="button">
              <Text style={styles.reserveButtonText}>Reserve a room</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal style={styles.sectionTabs} contentContainerStyle={styles.sectionTabsContent} showsHorizontalScrollIndicator={false}>
          {sectionTabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.sectionTab, activeSection === tab.id && styles.sectionTabActive]}
              onPress={() => scrollToSection(tab.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: activeSection === tab.id }}
            >
              <Text style={[styles.sectionTabText, activeSection === tab.id && styles.sectionTabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.galleryRow, desktopWeb && styles.galleryRowWeb]}>
          <View style={styles.galleryColumn}>
            <View style={[styles.galleryMosaic, desktopWeb && styles.galleryMosaicWeb]}>
              <TouchableOpacity
                style={styles.galleryMain}
                onPress={() => openPhotoGallery(hotelPhotos, `${hotel.name} photos`, heroIndex)}
                accessibilityRole="button"
                accessibilityLabel="View featured hotel photo"
                activeOpacity={0.92}
              >
                {hotelPhotos[heroIndex] ? (
                  <Animated.Image
                    key={hotelPhotos[heroIndex]}
                    source={{ uri: hotelPhotos[heroIndex] }}
                    style={[styles.heroImage, { opacity: heroOpacity, transform: [{ translateX: heroTranslateX }] }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.galleryPlaceholder}>
                    <Ionicons name="image-outline" size={38} color="#64748B" />
                    <Text style={styles.galleryPlaceholderText}>Photos coming soon</Text>
                  </View>
                )}
                <View style={styles.heroScrim} />
                {hotelPhotos.length > 1 ? <Text style={styles.heroCounter}>{String(heroIndex + 1).padStart(2, '0')} / {String(hotelPhotos.length).padStart(2, '0')}</Text> : null}
              </TouchableOpacity>
              {hotelPhotos.length > 1 ? (
                <View style={styles.gallerySide}>
                  {hotelPhotos.slice(1, 3).map((image, index) => (
                    <TouchableOpacity
                      key={`${image}-${index}`}
                      style={styles.gallerySideTile}
                      onPress={() => openPhotoGallery(hotelPhotos, `${hotel.name} photos`, index + 1)}
                      accessibilityRole="button"
                      accessibilityLabel={`View hotel photo ${index + 2}`}
                    >
                      <Image source={{ uri: image }} style={styles.gallerySideImage} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={styles.galleryStrip}>
              <ScrollView horizontal contentContainerStyle={styles.galleryThumbs} showsHorizontalScrollIndicator={false}>
                {hotelPhotos.slice(0, 5).map((image, index) => (
                  <TouchableOpacity
                    key={`${image}-thumb-${index}`}
                    style={[styles.galleryThumbButton, index === heroIndex && styles.galleryThumbActive]}
                    onPress={() => {
                      heroIndexRef.current = index;
                      setHeroIndex(index);
                      heroOpacity.setValue(0.72);
                      heroTranslateX.setValue(18);
                      Animated.parallel([
                        Animated.timing(heroOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
                        Animated.timing(heroTranslateX, { toValue: 0, duration: 420, useNativeDriver: true }),
                      ]).start();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Show hotel photo ${index + 1}`}
                  >
                    <Image source={{ uri: image }} style={styles.galleryThumbImage} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {hotelPhotos.length ? (
                <TouchableOpacity
                  style={styles.seeAllPhotosButton}
                  onPress={() => openPhotoGallery(hotelPhotos, `${hotel.name} photos`, heroIndex)}
                  accessibilityRole="button"
                >
                  <Ionicons name="images-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.seeAllPhotosText}>See all {hotelPhotos.length} photos</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={[styles.galleryAside, desktopWeb && styles.galleryAsideWeb]}>
            <View style={styles.ratingCard}>
              <View style={styles.ratingCardTop}>
                <View>
                  <Text style={styles.ratingCardLabel}>{hotel.review_count ? 'Guest rating' : 'New listing'}</Text>
                  <Text style={styles.ratingReviewCount}>{hotel.review_count ? `${hotel.review_count} verified reviews` : 'Be among the first to stay'}</Text>
                </View>
                <View style={styles.ratingBadge}><Text style={styles.ratingBadgeText}>{hotel.review_count ? Number(hotel.rating ?? 0).toFixed(1) : 'NEW'}</Text></View>
              </View>
              <Text style={styles.ratingCardCopy}>
                {hotel.review_count ? 'See what guests rated this stay.' : 'Guest ratings will appear here after the first completed stays.'}
              </Text>
              <TouchableOpacity onPress={() => scrollToSection('reviews')} accessibilityRole="button">
                <Text style={styles.inlineMapLink}>{hotel.review_count ? 'Read guest reviews' : 'Guest reviews'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.locationCard}>
              <View style={styles.locationCardIcon}><Ionicons name="location-outline" size={20} color="#087E8B" /></View>
              <View style={styles.locationCardCopy}>
                <Text style={styles.locationCardTitle}>Explore the area</Text>
                <Text style={styles.locationCardText}>{hotel.city}, {hotel.country}</Text>
              </View>
              <TouchableOpacity style={styles.mapButton} onPress={() => void openHotelLocation()} accessibilityRole="button">
                <Text style={styles.mapButtonText}>Show on map</Text>
                <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View
          style={styles.contentSection}
          onLayout={(event) => { sectionPositions.current.overview = event.nativeEvent.layout.y; }}
        >
          <Text style={styles.sectionTitle}>Property highlights</Text>
          <View style={styles.highlightsRow}>
            {(hotel.amenities ?? []).slice(0, desktopWeb ? 4 : 3).map((amenity, index) => (
              <View key={amenity} style={styles.highlightItem}>
                <View style={styles.highlightIcon}><Ionicons name={index === 0 ? 'sparkles-outline' : 'checkmark-circle-outline'} size={18} color="#087E8B" /></View>
                <View style={styles.highlightCopy}>
                  <Text style={styles.highlightTitle}>{amenity}</Text>
                  <Text style={styles.highlightMeta}>Available at this property</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.overviewGrid, desktopWeb && styles.overviewGridWeb]}>
          <View style={[styles.infoCard, styles.aboutCard]}>
            <Text style={styles.sectionTitle}>About this property</Text>
            <Text style={styles.description} numberOfLines={descriptionExpanded ? undefined : 5}>{hotel.description || 'The property details will be updated by the host.'}</Text>
            {hotel.description && hotel.description.length > 260 ? (
              <TouchableOpacity onPress={() => setDescriptionExpanded((expanded) => !expanded)} accessibilityRole="button">
                <Text style={styles.inlineMapLink}>{descriptionExpanded ? 'Show less' : 'Show more'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={[styles.infoCard, styles.facilitiesCard]} onLayout={(event) => { sectionPositions.current.facilities = event.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>Most popular facilities</Text>
            <View style={styles.chipWrap}>
              {(hotel.amenities ?? []).map((amenity) => (
                <View key={amenity} style={styles.chip}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#087E8B" />
                  <Text style={styles.chipText}>{amenity}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View
          style={styles.contentSection}
          onLayout={(event) => { sectionPositions.current.rooms = event.nativeEvent.layout.y; }}
        >
          <View style={styles.sectionHeadingRow}>
            <View>
              <Text style={styles.sectionTitle}>Room availability</Text>
              <Text style={styles.sectionSubheading}>Choose a room type to view details and continue booking.</Text>
            </View>
          </View>
          <View style={[styles.roomsGrid, desktopWeb && styles.roomsGridWeb]}>
            {(hotel.rooms ?? []).map((room, index) => (
              <View key={`${hotel.id}-${room.type ?? 'room'}-${index}`} style={styles.roomCard}>
                <Text style={styles.roomType}>{room.type ?? 'Room'}</Text>
                <Text style={styles.roomMeta}>{room.total_rooms ?? 0} available · {room.capacity_guests ? `Up to ${room.capacity_guests} guests` : 'Guest capacity varies'}</Text>
                {room.images?.length ? (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomImages}>
                      {room.images.map((image, imageIndex) => (
                        <TouchableOpacity
                          key={`${image}-${imageIndex}`}
                          onPress={() => openPhotoGallery(room.images ?? [], `${room.type ?? 'Room'} photos`, imageIndex)}
                          accessibilityRole="button"
                          accessibilityLabel={`View ${room.type ?? 'room'} photo ${imageIndex + 1}`}
                        >
                          <Image source={{ uri: image }} style={styles.roomImage} resizeMode="cover" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TouchableOpacity
                      style={styles.roomGalleryAction}
                      onPress={() => openPhotoGallery(room.images ?? [], `${room.type ?? 'Room'} photos`)}
                      accessibilityRole="button"
                    >
                      <Ionicons name="images-outline" size={16} color="#087E8B" />
                      <Text style={styles.roomGalleryActionText}>See all {room.images.length} room photos</Text>
                      <Ionicons name="chevron-forward" size={15} color="#087E8B" />
                    </TouchableOpacity>
                  </>
                ) : null}
                <View style={styles.roomBottomRow}>
                  <View>
                    <Text style={styles.roomPrice}>Le {Number(room.price_per_night ?? 0).toLocaleString()}</Text>
                    <Text style={styles.roomPriceUnit}>per night</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.bookRoomButton}
                    onPress={() => startBooking(room.type)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.bookRoomButtonText}>Book this room</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View
          style={styles.contentSection}
          onLayout={(event) => { sectionPositions.current.policies = event.nativeEvent.layout.y; }}
        >
          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Policies and important information</Text>
            <Text style={styles.description}>{hotel.policies ?? 'Flexible cancellation and check-in policy.'}</Text>
            <View style={styles.policyTimes}>
              <Text style={styles.policyTime}>Check-in <Text style={styles.policyTimeValue}>{hotel.check_in_time ?? '14:00'}</Text></Text>
              <Text style={styles.policyTime}>Check-out <Text style={styles.policyTimeValue}>{hotel.check_out_time ?? '11:00'}</Text></Text>
            </View>
          </View>
        </View>

        <View
          style={styles.contentSection}
          onLayout={(event) => { sectionPositions.current.reviews = event.nativeEvent.layout.y; }}
        >
          <View style={styles.infoCard}>
            <View style={styles.sectionHeadingRow}>
              <View>
                <Text style={styles.sectionTitle}>Guest reviews</Text>
                <Text style={styles.sectionSubheading}>{hotel.review_count ? `${hotel.review_count} reviews from completed stays` : 'No guest reviews yet'}</Text>
              </View>
              <View style={styles.reviewScore}>
                <Text style={styles.reviewScoreValue}>{hotel.review_count ? Number(hotel.rating ?? 0).toFixed(1) : 'NEW'}</Text>
              </View>
            </View>
            <Text style={styles.description}>
              {hotel.review_count ? 'The score is based on guest ratings for this property.' : 'Once guests complete their stays and leave ratings, the overall score will appear here.'}
            </Text>
          </View>
        </View>

      </ScrollView>
      <Modal
        visible={gallery !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setGallery(null)}
      >
        {gallery ? (
          <View style={styles.galleryModal}>
            <View style={styles.galleryModalHeader}>
              <TouchableOpacity
                style={styles.galleryBackButton}
                onPress={() => setGallery(null)}
                accessibilityRole="button"
                accessibilityLabel="Back to hotel information"
              >
                <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
                <Text style={styles.galleryBackText}>Hotel details</Text>
              </TouchableOpacity>
              <Text style={styles.galleryModalTitle} numberOfLines={1}>{gallery.title}</Text>
              <Text style={styles.galleryCount}>{gallery.index + 1} / {gallery.images.length}</Text>
            </View>
            <View style={styles.galleryViewerStage}>
              <Image
                source={{ uri: gallery.images[gallery.index] }}
                style={styles.galleryFullImage}
                resizeMode="contain"
              />
              {gallery.images.length > 1 ? (
                <>
                  <TouchableOpacity
                    style={[styles.galleryArrow, styles.galleryArrowLeft]}
                    onPress={() => moveGallery(-1)}
                    accessibilityRole="button"
                    accessibilityLabel="Previous photo"
                  >
                    <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.galleryArrow, styles.galleryArrowRight]}
                    onPress={() => moveGallery(1)}
                    accessibilityRole="button"
                    accessibilityLabel="Next photo"
                  >
                    <Ionicons name="chevron-forward" size={26} color="#FFFFFF" />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
            <ScrollView horizontal contentContainerStyle={styles.galleryThumbnails} showsHorizontalScrollIndicator={false}>
              {gallery.images.map((image, index) => (
                <TouchableOpacity
                  key={`${image}-${index}`}
                  style={[styles.galleryThumbnailButton, index === gallery.index && styles.galleryThumbnailSelected]}
                  onPress={() => setGallery((current) => current ? { ...current, index } : current)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show photo ${index + 1}`}
                >
                  <Image source={{ uri: image }} style={styles.galleryThumbnail} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F6F9',
  },
  topBar: {
    minHeight: 74,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E5EC',
  },
  backNavButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F1F4F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    justifyContent: 'flex-start',
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
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
    letterSpacing: 0,
  },
  brandNameAccent: {
    color: '#087E8B',
  },
  brandTagline: {
    marginTop: 1,
    color: '#79A0B1',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DEE8',
    marginLeft: 'auto',
  },
  favoriteIcon: {
    color: '#087E8B',
    fontSize: 18,
    fontWeight: '700',
  },
  container: {
    backgroundColor: '#F5F7F8',
  },
  content: {
    maxWidth: 1380,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 32,
  },
  contentWeb: {
    paddingHorizontal: 36,
    paddingTop: 24,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  breadcrumbLink: {
    color: '#087E8B',
    fontSize: 12,
    fontWeight: '600',
  },
  breadcrumbCurrent: {
    maxWidth: 180,
    color: '#667985',
    fontSize: 12,
  },
  hotelHeadingRow: {
    gap: 16,
    marginBottom: 18,
  },
  hotelHeadingRowWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hotelHeadingCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  stars: {
    color: '#B77A1C',
    fontSize: 14,
    fontWeight: '800',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 3,
  },
  locationSeparator: {
    color: '#82909B',
    marginHorizontal: 2,
  },
  inlineMapLink: {
    color: '#087E8B',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  headingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reserveButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderRadius: 6,
    backgroundColor: '#087E8B',
  },
  reserveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTabs: {
    maxHeight: 48,
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE6E9',
  },
  sectionTabsContent: {
    minWidth: '100%',
    alignItems: 'stretch',
    gap: 24,
  },
  sectionTab: {
    minHeight: 47,
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  sectionTabActive: {
    borderBottomColor: '#087E8B',
  },
  sectionTabText: {
    color: '#526974',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTabTextActive: {
    color: '#17354B',
    fontWeight: '800',
  },
  galleryRow: {
    gap: 14,
  },
  galleryRowWeb: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  galleryColumn: {
    flex: 1,
    minWidth: 0,
  },
  galleryMosaic: {
    height: 238,
    flexDirection: 'row',
    gap: 6,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#EAF4F6',
  },
  galleryMosaicWeb: {
    height: 330,
  },
  galleryMain: {
    flex: 1.7,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#EAF4F6',
  },
  gallerySide: {
    flex: 1,
    gap: 6,
  },
  gallerySideTile: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#EAF4F6',
  },
  gallerySideImage: {
    width: '100%',
    height: '100%',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(17, 42, 55, 0.13)',
  },
  heroCounter: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 5,
    backgroundColor: 'rgba(23, 53, 75, 0.72)',
  },
  galleryPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EAF4F6',
  },
  galleryPlaceholderText: {
    color: '#526174',
    fontSize: 13,
    fontWeight: '600',
  },
  galleryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 7,
  },
  galleryThumbs: {
    alignItems: 'center',
    gap: 7,
  },
  galleryThumbButton: {
    width: 88,
    height: 58,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 5,
  },
  galleryThumbActive: {
    borderColor: '#087E8B',
  },
  galleryThumbImage: {
    width: '100%',
    height: '100%',
  },
  seeAllPhotosButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 6,
    backgroundColor: '#087E8B',
  },
  seeAllPhotosText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  galleryAside: {
    gap: 10,
  },
  galleryAsideWeb: {
    width: 290,
  },
  ratingCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  ratingCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingCardLabel: {
    color: '#17354B',
    fontSize: 16,
    fontWeight: '800',
  },
  ratingReviewCount: {
    marginTop: 3,
    color: '#667985',
    fontSize: 11,
  },
  ratingBadge: {
    minWidth: 42,
    height: 40,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: '#087E8B',
  },
  ratingBadgeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  ratingCardCopy: {
    marginTop: 12,
    marginBottom: 9,
    color: '#526974',
    fontSize: 12,
    lineHeight: 18,
  },
  locationCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  locationCardIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#E8F5F7',
  },
  locationCardCopy: {
    marginTop: 10,
  },
  locationCardTitle: {
    color: '#17354B',
    fontSize: 14,
    fontWeight: '800',
  },
  locationCardText: {
    marginTop: 4,
    color: '#667985',
    fontSize: 12,
  },
  breadcrumbsAndDetails: {
    gap: 14,
  },
  contentSection: {
    marginTop: 26,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionSubheading: {
    marginTop: 4,
    color: '#667985',
    fontSize: 13,
    lineHeight: 19,
  },
  highlightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  highlightItem: {
    minWidth: 190,
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  highlightIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#E8F5F7',
  },
  highlightCopy: {
    flex: 1,
    minWidth: 0,
  },
  highlightTitle: {
    color: '#17354B',
    fontSize: 12,
    fontWeight: '700',
  },
  highlightMeta: {
    marginTop: 2,
    color: '#82909B',
    fontSize: 10,
  },
  overviewGrid: {
    gap: 14,
    marginTop: 14,
  },
  overviewGridWeb: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  aboutCard: {
    flex: 1.25,
  },
  facilitiesCard: {
    flex: 1,
  },
  roomsGrid: {
    gap: 10,
    marginTop: 12,
  },
  roomsGridWeb: {
    gap: 0,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  policyTimes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    marginTop: 15,
  },
  policyTime: {
    color: '#667985',
    fontSize: 13,
  },
  policyTimeValue: {
    color: '#17354B',
    fontWeight: '800',
  },
  reviewScore: {
    minWidth: 46,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: '#087E8B',
  },
  reviewScoreValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  locationPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5F7',
    color: '#0C7A8A',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  name: {
    marginTop: 12,
    fontSize: 30,
    fontWeight: '800',
    color: '#17354B',
    letterSpacing: 0,
  },
  meta: {
    color: '#475569',
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  rating: {
    marginTop: 10,
    color: '#8A5A00',
    fontWeight: '700',
    fontSize: 15,
  },
  ratingHint: {
    color: '#526174',
    fontSize: 13,
    fontWeight: '500',
  },
  sectionTitle: {
    marginTop: 12,
    color: '#17354B',
    fontWeight: '700',
    fontSize: 18,
  },
  description: {
    marginTop: 8,
    color: '#475569',
    lineHeight: 22,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8E2DF',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: '#344054',
    fontWeight: '600',
  },
  roomCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  roomImages: {
    marginTop: 10,
  },
  roomImage: {
    width: 155,
    height: 104,
    borderRadius: 6,
    marginRight: 8,
  },
  roomGalleryAction: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 4,
  },
  roomGalleryActionText: {
    flex: 1,
    color: '#087E8B',
    fontSize: 13,
    fontWeight: '700',
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
  roomBottomRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  roomPrice: {
    color: '#17354B',
    fontWeight: '700',
    fontSize: 15,
  },
  roomPriceUnit: {
    marginTop: 2,
    color: '#667085',
    fontSize: 12,
  },
  bookRoomButton: {
    backgroundColor: '#087E8B',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bookRoomButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  mapButton: {
    backgroundColor: '#087E8B',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  galleryModal: {
    flex: 1,
    paddingTop: 20,
    paddingBottom: 18,
    backgroundColor: '#07111F',
  },
  galleryModalHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  galleryBackButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  galleryBackText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  galleryModalTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  galleryCount: {
    color: '#D0D8E4',
    fontSize: 13,
    fontWeight: '600',
  },
  galleryViewerStage: {
    flex: 1,
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingVertical: 16,
  },
  galleryFullImage: {
    width: '100%',
    height: '100%',
  },
  galleryArrow: {
    position: 'absolute',
    top: '50%',
    width: 48,
    height: 48,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  galleryArrowLeft: {
    left: 14,
  },
  galleryArrowRight: {
    right: 14,
  },
  galleryThumbnails: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  galleryThumbnailButton: {
    width: 74,
    height: 58,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 5,
  },
  galleryThumbnailSelected: {
    borderColor: '#FFFFFF',
  },
  galleryThumbnail: {
    width: '100%',
    height: '100%',
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
    minWidth: 160,
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
    minWidth: 160,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#EAF5F6',
  },
  backText: {
    color: '#087E8B',
    fontWeight: '700',
  },
});
