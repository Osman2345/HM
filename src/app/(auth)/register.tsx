import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MobileAuthHeader from '@/components/auth/MobileAuthHeader';
import { useAuthStore } from '@/store/auth.store';

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingHotelId?: string | string[] }>();
  const bookingHotelId = typeof params.bookingHotelId === 'string' ? params.bookingHotelId : undefined;
  const signUp = useAuthStore((state) => state.signUp);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();

    if (!fullName.trim() || !normalizedEmail || !password) {
      setError('Please enter your full name, email, and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Your password must be at least six characters.');
      return;
    }

    setBusy(true);
    try {
      const verification = await signUp(normalizedEmail, password, fullName.trim(), 'user');
      router.replace({
        pathname: '/(auth)/verify-email',
        params: {
          email: normalizedEmail,
          userId: verification.userId,
          otpLength: String(verification.otpLength),
          expiresInSeconds: String(verification.expiresInSeconds),
          ...(bookingHotelId ? { bookingHotelId } : {}),
        },
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to create account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <MobileAuthHeader />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.label}>Full name</Text>
        <TextInput value={fullName} onChangeText={setFullName} placeholder="Full name" style={styles.input} />
        <Text style={styles.label}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" style={styles.input} />
        <Text style={styles.label}>Password</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" style={styles.input} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, busy ? styles.disabledButton : null]}
          onPress={() => void submit()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
        >
          <Text style={styles.primaryButtonText}>{busy ? 'Creating account…' : 'Create account'}</Text>
        </TouchableOpacity>

        <Link
          href={bookingHotelId ? { pathname: '/login', params: { bookingHotelId } } : '/login'}
          asChild
        >
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Already have an account?</Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 18,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  label: {
    color: '#0F172A',
    fontWeight: '600',
    marginBottom: 6,
  },
  error: {
    color: '#DC2626',
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '700',
  },
});
