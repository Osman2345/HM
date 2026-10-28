import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MobileAuthHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webHeader}>
        <View style={styles.webAccent} />
        <View style={styles.webHeaderContent}>
          <View style={styles.webBrandMark}>
            <Ionicons name="bed" size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.webBrand} accessibilityLabel="SL Stay">
              SL <Text style={styles.webBrandAccent}>STAY</Text>
            </Text>
            <Text style={styles.webTagline}>FIND YOUR PLACE</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace('/(tabs)')}
        accessibilityRole="button"
        accessibilityLabel="Back to home"
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <Text style={styles.brand} accessibilityLabel="SL Stay">
        <Text style={styles.brandAccent}>SL</Text>
        <Text> STAY</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 112,
    paddingHorizontal: 18,
    paddingBottom: 16,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#123A50',
  },
  webHeader: {
    minHeight: 116,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#123A50',
  },
  webAccent: {
    position: 'absolute',
    top: -74,
    right: '12%',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#1B5363',
    opacity: 0.6,
  },
  webHeaderContent: {
    width: '100%',
    maxWidth: 1050,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  webBrandMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#087E8B',
  },
  webBrand: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  webBrandAccent: {
    color: '#55D6A5',
  },
  webTagline: {
    marginTop: 3,
    color: '#C2D4D9',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    bottom: 15,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  brandAccent: {
    color: '#55D6A5',
  },
});
