import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MobileAuthHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') {
    return null;
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
