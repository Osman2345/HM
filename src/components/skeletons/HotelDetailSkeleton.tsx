import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Skeleton from '@/components/ui/skeleton';

export default function HotelDetailSkeleton() {
  const { width } = useWindowDimensions();
  const desktop = width >= 960;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      aria-busy
      aria-label="Loading"
      style={styles.screen}
    >
      <View style={styles.topBar}>
        <Skeleton style={styles.topBarButton} />
        <Skeleton style={styles.brand} />
        <Skeleton style={styles.topBarButton} />
      </View>
      <ScrollView style={styles.scroll}>
        <View style={[styles.content, desktop && styles.contentDesktop]}>
          <View style={styles.breadcrumbs}>
            <Skeleton style={styles.breadcrumb} />
            <Skeleton style={styles.breadcrumb} />
            <Skeleton style={styles.breadcrumbLong} />
          </View>
          <View style={[styles.heading, desktop && styles.headingDesktop]}>
            <View style={styles.headingCopy}>
              <Skeleton style={styles.rating} />
              <Skeleton style={styles.title} />
              <Skeleton style={styles.location} />
            </View>
            <Skeleton style={styles.reserveButton} />
          </View>
          <View style={[styles.galleryRow, desktop && styles.galleryRowDesktop]}>
            <View style={[styles.gallery, desktop && styles.galleryDesktop]}>
              <Skeleton style={styles.mainPhoto} />
              <View style={styles.sidePhotos}>
                <Skeleton style={styles.sidePhoto} />
                <Skeleton style={styles.sidePhoto} />
              </View>
            </View>
            <View style={[styles.bookingBox, desktop && styles.bookingBoxDesktop]}>
              <Skeleton style={styles.boxTitle} />
              <Skeleton style={styles.boxLine} />
              <Skeleton style={styles.boxLineShort} />
              <Skeleton style={styles.boxButton} />
            </View>
          </View>
          <View style={styles.amenities}>
            <Skeleton style={styles.sectionTitle} />
            <View style={styles.amenityRow}>
              <Skeleton style={styles.amenity} />
              <Skeleton style={styles.amenity} />
              <Skeleton style={styles.amenity} />
            </View>
          </View>
          <View style={styles.contentPanel}>
            <Skeleton style={styles.sectionTitle} />
            <Skeleton style={styles.paragraph} />
            <Skeleton style={styles.paragraphShort} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7F8' },
  topBar: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topBarButton: { width: 38, height: 38, borderRadius: 20 },
  brand: { width: 132, height: 30 },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 1380,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 32,
    gap: 18,
  },
  contentDesktop: { paddingHorizontal: 36, paddingTop: 24 },
  breadcrumbs: { flexDirection: 'row', gap: 9, marginBottom: 2 },
  breadcrumb: { width: 56, height: 12 },
  breadcrumbLong: { width: 114, height: 12 },
  heading: { gap: 12, marginBottom: 2 },
  headingDesktop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headingCopy: { flex: 1, gap: 8 },
  rating: { width: 104, height: 14 },
  title: { width: '62%', height: 28 },
  location: { width: 232, height: 15, marginTop: 2 },
  reserveButton: { width: 142, height: 44 },
  galleryRow: { gap: 14 },
  galleryRowDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  gallery: {
    height: 238,
    flexDirection: 'row',
    gap: 6,
    overflow: 'hidden',
    borderRadius: 8,
  },
  galleryDesktop: { height: 330, flex: 1 },
  mainPhoto: { flex: 1.7 },
  sidePhotos: { flex: 1, gap: 6 },
  sidePhoto: { flex: 1 },
  bookingBox: {
    gap: 11,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  bookingBoxDesktop: { width: 290 },
  boxTitle: { width: '64%', height: 20, marginBottom: 4 },
  boxLine: { width: '100%', height: 14 },
  boxLineShort: { width: '72%', height: 14 },
  boxButton: { height: 42, marginTop: 8 },
  amenities: { gap: 12, marginTop: 3 },
  sectionTitle: { width: 184, height: 20 },
  amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  amenity: { width: 138, height: 48, borderRadius: 8 },
  contentPanel: {
    minHeight: 142,
    gap: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  paragraph: { width: '94%', height: 13, marginTop: 4 },
  paragraphShort: { width: '72%', height: 13 },
});
