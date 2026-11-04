import { StyleSheet, View } from 'react-native';
import Skeleton from '@/components/ui/skeleton';

export default function TableRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      aria-busy
      aria-label="Loading"
      style={styles.list}
    >
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.card}>
          <Skeleton style={styles.id} />
          <Skeleton style={styles.title} />
          <Skeleton style={styles.meta} />
          <Skeleton style={styles.metaWide} />
          <Skeleton style={styles.metaMedium} />
          <Skeleton style={styles.metaWide} />
          <Skeleton style={styles.amount} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', gap: 12 },
  card: {
    minHeight: 204,
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  id: { width: 116, height: 13 },
  title: { width: '62%', height: 21, marginTop: 2 },
  meta: { width: '55%', height: 14 },
  metaWide: { width: '78%', height: 14 },
  metaMedium: { width: '68%', height: 14 },
  amount: { width: 126, height: 21, marginTop: 3 },
});
