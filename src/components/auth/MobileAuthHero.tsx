import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

export default function MobileAuthHero() {
  const { width } = useWindowDimensions();

  return (
    <View pointerEvents="none" style={styles.hero}>
      <View style={[styles.ring, styles.ringLarge, { top: -28, left: -width * 0.18 }]} />
      <View style={[styles.ring, styles.ringMedium, { top: 13, left: -width * 0.08 }]} />
      <View style={[styles.ring, styles.ringSmall, { top: 37, left: -width * 0.015 }]} />
      <View style={[styles.ring, styles.ringLarge, { top: 36, right: -width * 0.52 }]} />
      <View style={[styles.ring, styles.ringMedium, { top: 75, right: -width * 0.34 }]} />
      <View style={[styles.brand, { top: 18 }]}>
        <View style={styles.brandIcon}>
          <Ionicons name="bed" size={18} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.brandName} accessibilityLabel="SL Stay">SL STAY</Text>
          <Text style={styles.brandTagline}>FIND YOUR PLACE</Text>
        </View>
      </View>
      <View style={[styles.whiteWave, { top: 181 }]} />
      <View style={[styles.whiteBase, { top: 248 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: '#087E8B',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
  },
  ringLarge: {
    width: 220,
    height: 220,
  },
  ringMedium: {
    width: 164,
    height: 164,
  },
  ringSmall: {
    width: 108,
    height: 108,
  },
  brand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  brandTagline: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  whiteWave: {
    position: 'absolute',
    left: '-28%',
    width: '160%',
    height: 108,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '4deg' }],
  },
  whiteBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 52,
    backgroundColor: '#FFFFFF',
  },
});
