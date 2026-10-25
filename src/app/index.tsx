import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '@/store/auth.store';

export default function IndexScreen() {
  const router = useRouter();
  const session = useAuthStore((state: { session: unknown }) => state.session);
  const role = useAuthStore((state: { role: string | null }) => state.role);
  const disabled = useAuthStore((state: { profile: { disabled?: boolean } | null }) => state.profile?.disabled ?? false);
  const vendorStatus = useAuthStore((state: { profile: { vendor_status?: string | null } | null }) => state.profile?.vendor_status ?? null);
  const loading = useAuthStore((state: { loading: boolean }) => state.loading);
  const [splashDurationElapsed, setSplashDurationElapsed] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const timer = setTimeout(() => setSplashDurationElapsed(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading || (Platform.OS !== 'web' && !splashDurationElapsed)) {
      return;
    }

    if (!session) {
      router.replace('/(tabs)');
      return;
    }

    if (disabled) {
      router.replace('/(auth)/account-disabled');
      return;
    }

    if (Platform.OS === 'web') {
      router.replace('/(tabs)');
      return;
    }

    if (role === 'admin') {
      router.replace('/(admin)/dashboard');
      return;
    }

    if (role === 'vendor') {
      if (vendorStatus === 'pending' || vendorStatus === 'rejected') {
        router.replace('/(auth)/vendor-pending');
        return;
      }

      router.replace('/(vendor)/dashboard');
      return;
    }

    router.replace('/(tabs)');
  }, [disabled, loading, role, router, session, splashDurationElapsed, vendorStatus]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.mobileSplash}>
        <Text style={styles.brandName} accessibilityLabel="SL STAY">
          <Text style={styles.brandGreen}>SL</Text>
          <Text style={styles.brandWhite}> ST</Text>
          <Text style={styles.brandBlue}>AY</Text>
          <Text style={styles.brandEllipsis}>...</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563EB" />
      <Text style={styles.title}>SL Stay</Text>
      <Text style={styles.subtitle}>
        {loading ? 'Loading session…' : session ? `Signed in as ${role ?? 'guest'}` : 'Opening hotels…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileSplash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#123A50',
  },
  brandName: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  brandGreen: {
    color: '#39D6A0',
  },
  brandWhite: {
    color: '#FFFFFF',
  },
  brandBlue: {
    color: '#70B7FF',
  },
  brandEllipsis: {
    color: '#B8CCD6',
    letterSpacing: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#475569',
  },
});
