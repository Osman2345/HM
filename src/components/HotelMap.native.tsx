import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { StyleSheet } from 'react-native';

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
  region: Region;
  onRegionChange: (region: Region) => void;
  onSelectHotel: (hotel: HotelMapItem) => void;
};

export default function HotelMapNative({
  hotels,
  selectedHotelId,
  region,
  onRegionChange,
  onSelectHotel,
}: HotelMapProps) {
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      region={region}
      showsUserLocation
      showsMyLocationButton
      onRegionChangeComplete={onRegionChange}
    >
      {hotels.map((hotel) => (
        <Marker
          key={hotel.id}
          coordinate={{
            latitude: hotel.latitude ?? 0,
            longitude: hotel.longitude ?? 0,
          }}
          title={hotel.name}
          description={hotel.location || hotel.city}
          pinColor={selectedHotelId === hotel.id ? '#087E8B' : '#F2B544'}
          onPress={() => onSelectHotel(hotel)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
