import { createElement, type CSSProperties } from 'react';
import { StyleSheet, View } from 'react-native';

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

const iframeStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  border: 0,
};

export default function HotelMapWeb({
  hotels,
  selectedHotelId,
  region,
}: HotelMapProps) {
  const selectedLocation =
    hotels.find((hotel) => hotel.id === selectedHotelId && hotel.latitude != null && hotel.longitude != null) ??
    hotels.find((hotel) => hotel.latitude != null && hotel.longitude != null) ??
    null;

  const center = {
    lat: selectedLocation?.latitude ?? region.latitude,
    lng: selectedLocation?.longitude ?? region.longitude,
  };

  const latitudeDelta = Math.max(Math.abs(region.latitudeDelta), 0.02);
  const longitudeDelta = Math.max(Math.abs(region.longitudeDelta), 0.02);
  const bounds = [
    center.lng - longitudeDelta / 2,
    center.lat - latitudeDelta / 2,
    center.lng + longitudeDelta / 2,
    center.lat + latitudeDelta / 2,
  ].join(',');
  const mapUrl = new URL('https://www.openstreetmap.org/export/embed.html');
  mapUrl.searchParams.set('bbox', bounds);
  mapUrl.searchParams.set('layer', 'mapnik');
  if (selectedLocation) {
    mapUrl.searchParams.set('marker', `${center.lat},${center.lng}`);
  }

  return (
    <View style={styles.map}>
      {createElement('iframe', {
        title: selectedLocation ? `Map showing ${selectedLocation.name}` : 'Map of nearby stays',
        src: mapUrl.toString(),
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        allowFullScreen: true,
        style: iframeStyle,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
});
