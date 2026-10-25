import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';

export default function AccountDisabledScreen() {
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to sign out.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Account disabled</Text>
      <Text style={styles.message}>
        This account has been disabled by an administrator. Contact support if you believe this is a mistake.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.button}
        onPress={() => void handleSignOut()}
        disabled={signingOut}
      >
        <Text style={styles.buttonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  heading: { fontSize: 26, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  message: { marginTop: 12, color: '#475569', textAlign: 'center', lineHeight: 22 },
  error: { marginTop: 12, color: '#B91C1C', textAlign: 'center' },
  button: { minHeight: 48, marginTop: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1D4ED8', borderRadius: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
