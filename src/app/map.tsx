import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import HotelMap from '@/components/HotelMap';
import { supabase } from '@/lib/supabase';

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type HotelRow = {
  id: string;
  name: string;
  city: string;
  location: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  cover_image: string | null;
  description: string | null;
};

const defaultRegion: MapRegion = {
  latitude: 8.4657,
  longitude: -13.2317,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

const resolveLocationName = (
  addresses: Array<{ city?: string | null; district?: string | null; subregion?: string | null; region?: string | null }> = [],
) => addresses[0]?.city || addresses[0]?.district || addresses[0]?.subregion || addresses[0]?.region || 'Current area';

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hotelId?: string | string[] }>();
  const hotelId = Array.isArray(params.hotelId) ? params.hotelId[0] : params.hotelId;
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<HotelRow | null>(null);
  const [userCity, setUserCity] = useState('Freetown');
  const [region, setRegion] = useState<MapRegion>(defaultRegion);

  useEffect(() => {
    let active = true;

    const loadSelectedHotel = async () => {
      if (!hotelId) {
        return;
      }

      try {
        const { data, error: hotelError } = await supabase
          .from('hotels')
          .select('id, name, city, location, country, latitude, longitude, rating, cover_image, description')
          .eq('id', hotelId)
          .eq('approval_status', 'approved')
          .maybeSingle();

        if (hotelError) throw hotelError;

        if (!active) {
          return;
        }

        const selected = (data ?? null) as HotelRow | null;
        if (!selected) {
          setError('Hotel not found.');
          setLoading(false);
          return;
        }

        setHotels([selected]);
        setSelectedHotel(selected);
        setUserCity(selected.city || 'Selected hotel');
        if (selected.latitude != null && selected.longitude != null) {
          setRegion({
            latitude: selected.latitude,
            longitude: selected.longitude,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          });
        }
      } catch (caughtError) {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : 'Unable to load hotel location.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const loadNearbyHotelsForCity = async (cityKeyword: string) => {
      const resolvedCity = cityKeyword || 'Current area';
      const safeCity = resolvedCity.replace(/'/g, "''");

      const nearbyQuery = await supabase
        .from('hotels')
        .select('id, name, city, location, country, latitude, longitude, rating, cover_image, description')
        .eq('approval_status', 'approved')
        .or(`city.ilike.%${safeCity}%,location.ilike.%${safeCity}%`)
        .limit(12);

      if (nearbyQuery.error) {
        throw nearbyQuery.error;
      }

      const nearbyHotels = (nearbyQuery.data ?? []) as HotelRow[];
      const finalHotels = nearbyHotels.length > 0 ? nearbyHotels : ((await supabase
        .from('hotels')
        .select('id, name, city, location, country, latitude, longitude, rating, cover_image, description')
        .eq('approval_status', 'approved')
        .limit(12)).data ?? []) as HotelRow[];

      if (!active) {
        return;
      }

      setUserCity(resolvedCity);
      setHotels(finalHotels);
      const firstAvailableHotel = finalHotels.find((hotel) => hotel.latitude != null && hotel.longitude != null) ?? null;
      setSelectedHotel(firstAvailableHotel ?? finalHotels[0] ?? null);
      if (firstAvailableHotel) {
        setRegion({
          latitude: firstAvailableHotel.latitude ?? defaultRegion.latitude,
          longitude: firstAvailableHotel.longitude ?? defaultRegion.longitude,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        });
      }
    };

    const loadNearbyHotels = async () => {
      setLoading(true);
      setError(null);

      if (hotelId) {
        await loadSelectedHotel();
        return;
      }

      try {
        let cityKeyword = 'Current area';

        if (Platform.OS === 'web') {
          const geolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null;

          if (geolocation) {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 60000,
              });
            });

            try {
              const geocoded = await Location.reverseGeocodeAsync({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
              cityKeyword = resolveLocationName(geocoded);
            } catch {
              cityKeyword = 'Current area';
            }
          }
        } else {
          const permission = await Location.getForegroundPermissionsAsync();
          if (permission.status !== 'granted') {
            const requested = await Location.requestForegroundPermissionsAsync();
            if (requested.status !== 'granted') {
              cityKeyword = 'Current area';
            }
          }

          if (cityKeyword === 'Current area' && permission.status === 'granted') {
            const hasLocationServices = await Location.hasServicesEnabledAsync();
            if (hasLocationServices) {
              const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

              try {
                const geocoded = await Location.reverseGeocodeAsync({
                  latitude: currentLocation.coords.latitude,
                  longitude: currentLocation.coords.longitude,
                });
                cityKeyword = resolveLocationName(geocoded);
              } catch {
                cityKeyword = 'Current area';
              }
            }
          }
        }

        await loadNearbyHotelsForCity(cityKeyword);
      } catch (caughtError) {
        if (active) {
          setUserCity('Current area');
          setHotels([]);
          setError(caughtError instanceof Error ? caughtError.message : 'Unable to load nearby hotels');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadNearbyHotels();

    return () => {
      active = false;
    };
  }, [hotelId]);

  useEffect(() => {
    if (selectedHotel && selectedHotel.latitude != null && selectedHotel.longitude != null) {
      setRegion({
        latitude: selectedHotel.latitude,
        longitude: selectedHotel.longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      });
    }
  }, [selectedHotel]);

  const summaryText = useMemo(() => {
    if (loading) return hotelId ? 'Loading hotel location…' : 'Finding hotels near you…';
    if (error) return 'Map unavailable';
    return hotelId ? `Hotel location in ${userCity}` : `Hotels around ${userCity}`;
  }, [error, hotelId, loading, userCity]);

  const mapHotels = hotels.filter((hotel) => hotel.latitude != null && hotel.longitude != null);

  const openDirections = async (hotel: HotelRow) => {
    const latitude = Number(hotel.latitude);
    const longitude = Number(hotel.longitude);
    const query = encodeURIComponent(`${hotel.name} ${hotel.city} ${hotel.country || 'Sierra Leone'}`);
    const url = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${query}`;

    try {
      await Linking.openURL(url);
    } catch {
      setError('Unable to open directions for this hotel.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <Ionicons name="chevron-back" size={22} color="#17354B" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.heading}>Map</Text>
          <Text style={styles.subtitle}>{summaryText}</Text>
        </View>
      </View>

      {loading ? <Text style={styles.loading}>Loading nearby hotels…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.mapCard}>
        <HotelMap
          hotels={mapHotels}
          selectedHotelId={selectedHotel?.id ?? null}
          region={region}
          onRegionChange={setRegion}
          onSelectHotel={(mapHotel) => {
            const selected = hotels.find((hotel) => hotel.id === mapHotel.id);
            if (selected) setSelectedHotel(selected);
          }}
        />
      </View>

      {hotels.length > 0 ? (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Nearby stays</Text>
          {hotels.map((hotel) => (
            <TouchableOpacity
              key={hotel.id}
              style={[styles.hotelCard, selectedHotel?.id === hotel.id && styles.hotelCardSelected]}
              onPress={() => setSelectedHotel(hotel)}
            >
              <View style={styles.hotelTextWrap}>
                <Text style={styles.hotelName}>{hotel.name}</Text>
                <Text style={styles.hotelMeta}>{hotel.location || hotel.city}</Text>
                <Text style={styles.hotelMeta}>{hotel.country || 'Sierra Leone'}</Text>
              </View>
              <View style={styles.inlineAction}>
                <Text style={styles.inlineActionText}>Select</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {selectedHotel ? (
        <View style={styles.selectionCard}>
          <Text style={styles.selectionTitle}>{selectedHotel.name}</Text>
          <Text style={styles.selectionMeta}>{selectedHotel.location || selectedHotel.city}</Text>
          <Text style={styles.selectionMeta}>{selectedHotel.country || 'Sierra Leone'}</Text>
          {selectedHotel.description ? <Text style={styles.description}>{selectedHotel.description}</Text> : null}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => router.push({ pathname: '/hotel/[id]', params: { id: selectedHotel.id } })}
            >
              <Text style={styles.primaryActionText}>View hotel</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => void openDirections(selectedHotel)}
          >
            <Text style={styles.secondaryActionText}>Show directions</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingTop: 24,
    gap: 14,
    backgroundColor: '#F5F7F8',
    minHeight: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTextWrap: {
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F6',
  },
  heading: {
    color: '#17354B',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    color: '#5E7382',
    fontSize: 12,
    fontWeight: '600',
  },
  loading: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '600',
  },
  mapCard: {
    height: 260,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D9E6EB',
    backgroundColor: '#EAF5F8',
  },
  map: {
    flex: 1,
  },
  webMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EBF7F9',
    paddingHorizontal: 20,
  },
  webMapTitle: {
    color: '#17354B',
    fontSize: 20,
    fontWeight: '800',
  },
  webMapText: {
    marginTop: 8,
    color: '#5E7382',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  listSection: {
    gap: 10,
  },
  listTitle: {
    color: '#17354B',
    fontSize: 18,
    fontWeight: '800',
  },
  hotelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7EEF1',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  hotelCardSelected: {
    borderColor: '#087E8B',
    backgroundColor: '#F4FBFC',
  },
  hotelTextWrap: {
    flex: 1,
  },
  hotelName: {
    color: '#17354B',
    fontSize: 16,
    fontWeight: '800',
  },
  hotelMeta: {
    marginTop: 3,
    color: '#5E7382',
    fontSize: 12,
    fontWeight: '600',
  },
  inlineAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EAF5F6',
  },
  inlineActionText: {
    color: '#0A5F6B',
    fontSize: 12,
    fontWeight: '800',
  },
  selectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7EBED',
    padding: 16,
  },
  selectionTitle: {
    color: '#17354B',
    fontSize: 20,
    fontWeight: '800',
  },
  selectionMeta: {
    marginTop: 4,
    color: '#5E7382',
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    marginTop: 10,
    color: '#495F6E',
    fontSize: 13,
    lineHeight: 19,
  },
  actionsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryAction: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F6',
    borderWidth: 1,
    borderColor: '#CFE8EC',
  },
  secondaryActionText: {
    color: '#0A5F6B',
    fontSize: 13,
    fontWeight: '800',
  },
});
