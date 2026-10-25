import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { defaultRegion } from '@/lib/geo';

type HotelRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string;
};

export default function MapScreen() {
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [MapComponent, setMapComponent] = useState<any>(null);

  useEffect(() => {
    let isActive = true;

    if (Platform.OS !== 'web') {
      void import('react-native-maps')
        .then((module) => {
          if (isActive) {
            setMapComponent(module.default);
          }
        })
        .catch(() => {
          if (isActive) {
            setError('The native map module is unavailable');
          }
        });
    }

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const loadNearby = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('hotels')
          .select('id, name, latitude, longitude, city')
          .eq('approval_status', 'approved')
          .limit(12);

        if (fetchError) {
          throw fetchError;
        }

        setHotels((data ?? []) as HotelRow[]);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Unable to load map data');
      } finally {
        setLoading(false);
      }
    };

    void loadNearby();
  }, []);

  if (Platform.OS === 'web') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Map</Text>
        <Text style={styles.webNote}>Map view is available on native devices. Using the nearest hotel list on web.</Text>
        {hotels.map((hotel) => (
          <View key={hotel.id} style={styles.locationCard}>
            <Text style={styles.name}>{hotel.name}</Text>
            <Text style={styles.meta}>{hotel.city}</Text>
            <Text style={styles.meta}>{hotel.latitude}, {hotel.longitude}</Text>
          </View>
        ))}
      </ScrollView>
    );
  }

  if (!MapComponent) {
    return (
      <View style={styles.nativeMapWrap}>
        <Text style={styles.heading}>Map</Text>
        <Text style={styles.meta}>Loading map…</Text>
      </View>
    );
  }

  const Marker = (MapComponent as any).Marker;

  return (
    <View style={styles.nativeMapWrap}>
      <Text style={styles.heading}>Map</Text>
      {loading ? <Text style={styles.meta}>Loading map…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading ? (
        <MapComponent style={styles.map} initialRegion={defaultRegion as any}>
          {hotels.map((hotel) => (
            <Marker
              key={hotel.id}
              coordinate={{ latitude: hotel.latitude, longitude: hotel.longitude }}
              title={hotel.name}
              description={hotel.city}
            />
          ))}
        </MapComponent>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  webNote: {
    color: '#475569',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
  },
  meta: {
    color: '#475569',
  },
  nativeMapWrap: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 12,
  },
  map: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
  },
  error: {
    color: '#DC2626',
  },
});
