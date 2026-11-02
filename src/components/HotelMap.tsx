import { Platform } from 'react-native';

import HotelMapNative from './HotelMap.native';
import HotelMapWeb from './HotelMap.web';

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

export default function HotelMap(props: HotelMapProps) {
  if (Platform.OS === 'web') {
    return <HotelMapWeb {...props} />;
  }

  return <HotelMapNative {...props} />;
}
