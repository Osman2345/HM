import { StyleSheet, View } from 'react-native';
import Skeleton from '@/components/ui/skeleton';

export default function HotelCardSkeleton({ desktop = false }: { desktop?: boolean }) {
  return (
    <View style={[styles.card, desktop && styles.desktopCard]}>
      <View style={[styles.image, desktop && styles.desktopImage]} />
      <View style={[styles.details, desktop && styles.desktopDetails]}>
        <Skeleton style={styles.title} />
        <Skeleton style={styles.titleShort} />
        <View style={styles.locationRow}>
          <Skeleton style={styles.locationIcon} />
          <Skeleton style={styles.location} />
        </View>
        <Skeleton style={styles.description} />
        <View style={styles.priceRow}>
          <Skeleton style={styles.price} />
          <Skeleton style={styles.priceCaption} />
        </View>
        {desktop ? <Skeleton style={styles.button} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 245,
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE1E5',
    backgroundColor: '#FFFFFF',
  },
  desktopCard: {
    width: '31.8%',
    minHeight: 395,
    flexDirection: 'column',
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: '#E6EBEC',
  },
  image: {
    width: '38%',
    minHeight: 218,
    borderRadius: 10,
  },
  desktopImage: {
    width: '100%',
    height: 170,
    minHeight: 170,
  },
  details: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 10,
    paddingLeft: 12,
    paddingRight: 14,
    paddingTop: 4,
  },
  desktopDetails: {
    paddingHorizontal: 0,
    paddingTop: 12,
  },
  title: { width: '88%', height: 18 },
  titleShort: { width: '64%', height: 18 },
  locationRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  locationIcon: { width: 15, height: 15, borderRadius: 8 },
  location: { width: '67%', height: 13 },
  description: { width: '76%', height: 12 },
  priceRow: { marginTop: 'auto', gap: 5 },
  price: { width: 112, height: 20 },
  priceCaption: { width: 142, height: 12 },
  button: { width: '100%', height: 38, marginTop: 4 },
});
