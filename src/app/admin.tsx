import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '@/store/auth.store';

export default function AdminEntryScreen() {
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const loading = useAuthStore((state) => state.loading);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.message}>Checking administrator access…</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (profile?.disabled) {
    return <Redirect href="/(auth)/account-disabled" />;
  }

  if (profile?.role === 'admin') {
    return <Redirect href="/(admin)/dashboard" />;
  }

  if (profile?.role === 'vendor') {
    return profile.vendor_status === 'approved'
      ? <Redirect href="/(vendor)/dashboard" />
      : <Redirect href="/(auth)/vendor-pending" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
  },
  message: {
    color: '#475569',
  },
});
