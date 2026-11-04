import { StyleSheet, View } from 'react-native';
import Skeleton from '@/components/ui/skeleton';

interface DashboardStatSkeletonProps {
  count?: number;
  compact?: boolean;
}

export default function DashboardStatSkeleton({ count = 4, compact = false }: DashboardStatSkeletonProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      aria-busy
      aria-label="Loading"
      style={[styles.grid, compact && styles.gridCompact]}
    >
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.card, compact && styles.cardCompact]}>
          <View style={styles.topRow}>
            <Skeleton style={styles.icon} />
            <Skeleton style={styles.trend} />
          </View>
          <Skeleton style={styles.value} />
          <Skeleton style={styles.label} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  gridCompact: { gap: 10 },
  card: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 143,
    gap: 12,
    padding: 17,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E9EFF0',
    backgroundColor: '#FFFFFF',
  },
  cardCompact: { flexBasis: '46%', minWidth: 0, padding: 13 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  icon: { width: 37, height: 37, borderRadius: 11 },
  trend: { width: 18, height: 18, borderRadius: 9 },
  value: { width: '64%', height: 28, marginTop: 3 },
  label: { width: '85%', height: 13 },
});
