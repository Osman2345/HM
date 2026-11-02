import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { StyleSheet, Text, View } from 'react-native';

type HotelMapItem = {
  id: string;
  name: string;
  city: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
};

type HotelMapProps = {
  hotels: HotelMapItem[];
  selectedHotelId: string | null;
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onRegionChange: (region: any) => void;
  onSelectHotel: (hotel: HotelMapItem) => void;
};

export default function HotelMapWeb({
  hotels,
  selectedHotelId,
  region,
  onSelectHotel,
}: HotelMapProps) {
  const webApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';

  if (!webApiKey) {
    return (
      <View style={styles.webMapFallback}>
        <Text style={styles.webMapTitle}>Map preview</Text>
        <Text style={styles.webMapText}>Add EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY to enable the browser map.</Text>
      </View>
    );
  }

  const selectedLocation =
    hotels.find((hotel) => hotel.id === selectedHotelId && hotel.latitude != null && hotel.longitude != null) ??
    hotels.find((hotel) => hotel.latitude != null && hotel.longitude != null) ??
    null;

  const center = {
    lat: selectedLocation?.latitude ?? region.latitude,
    lng: selectedLocation?.longitude ?? region.longitude,
  };

  return (
    <APIProvider apiKey={webApiKey}>
      <Map
        style={styles.map}
        defaultCenter={center}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI={false}
      >
        {hotels
          .filter((hotel) => hotel.latitude != null && hotel.longitude != null)
          .map((hotel) => (
            <Marker
              key={hotel.id}
              position={{
                lat: hotel.latitude ?? center.lat,
                lng: hotel.longitude ?? center.lng,
              }}
              title={hotel.name}
              onClick={() => onSelectHotel(hotel)}
            />
          ))}
      </Map>
    </APIProvider>
  );
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    height: '100%',
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
});
