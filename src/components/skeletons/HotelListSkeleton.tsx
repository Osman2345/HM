import { StyleSheet, View } from 'react-native';
import HotelCardSkeleton from '@/components/skeletons/HotelCardSkeleton';

export default function HotelListSkeleton({ desktop = false }: { desktop?: boolean }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      aria-busy
      aria-label="Loading"
      style={[styles.list, desktop && styles.desktopList]}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <HotelCardSkeleton key={index} desktop={desktop} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { width: '100%' },
  desktopList: {
    minHeight: 395,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingHorizontal: 18,
  },
});
