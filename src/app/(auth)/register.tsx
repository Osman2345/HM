import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MobileAuthHeader from '@/components/auth/MobileAuthHeader';
import MobileAuthHero from '@/components/auth/MobileAuthHero';
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
      {Platform.OS === 'web' ? <MobileAuthHeader /> : <MobileAuthHero />}
      <ScrollView
        style={Platform.OS !== 'web' ? styles.mobileScroll : undefined}
        contentContainerStyle={StyleSheet.flatten([
          styles.container,
          Platform.OS === 'web' ? styles.webContainer : styles.mobileContainer,
          Platform.OS !== 'web' ? { paddingTop: 220 } : undefined,
        ])}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={StyleSheet.flatten([styles.title, Platform.OS !== 'web' && styles.mobileTitle])}>
          {Platform.OS === 'web' ? 'Create your account' : 'Sign up'}
        </Text>
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          placeholder="Full name"
          placeholderTextColor="#94A3A8"
          style={StyleSheet.flatten([styles.input, Platform.OS !== 'web' && styles.mobileInput])}
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="name@example.com"
          placeholderTextColor="#94A3A8"
          style={StyleSheet.flatten([styles.input, Platform.OS !== 'web' && styles.mobileInput])}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          placeholder="At least 6 characters"
          placeholderTextColor="#94A3A8"
          style={StyleSheet.flatten([styles.input, Platform.OS !== 'web' && styles.mobileInput])}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={StyleSheet.flatten([
            styles.primaryButton,
            Platform.OS !== 'web' && styles.mobilePrimaryButton,
            busy ? styles.disabledButton : null,
          ])}
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
          <TouchableOpacity style={StyleSheet.flatten([styles.secondaryButton, Platform.OS !== 'web' && styles.mobileSecondaryButton])}>
            <Text style={StyleSheet.flatten([styles.secondaryButtonText, Platform.OS !== 'web' && styles.mobileSecondaryButtonText])}>
              {Platform.OS === 'web' ? 'Already have an account?' : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        </Link>
        {Platform.OS === 'web' ? (
          <Link href="/login?audience=vendor" asChild>
            <TouchableOpacity style={styles.vendorLink}>
              <Text style={styles.vendorLinkText}>Sign in as a vendor</Text>
            </TouchableOpacity>
          </Link>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mobileScroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  webContainer: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    marginVertical: 36,
    borderWidth: 1,
    borderColor: '#E4EAEB',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 8px 26px rgba(25, 56, 73, 0.08)',
  },
  mobileContainer: {
    paddingTop: 220,
    paddingHorizontal: 28,
    paddingBottom: 36,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 18,
  },
  mobileTitle: {
    color: '#17354B',
    fontSize: 28,
    fontWeight: '800',
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
  mobileInput: {
    minHeight: 44,
    paddingHorizontal: 2,
    paddingVertical: 8,
    marginBottom: 14,
    borderColor: '#D5E4E5',
    borderRadius: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    backgroundColor: 'transparent',
    color: '#17354B',
    fontSize: 14,
  },
  label: {
    color: '#526974',
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
  mobilePrimaryButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#087E8B',
    marginTop: 18,
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
  mobileSecondaryButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderWidth: 0,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '700',
  },
  mobileSecondaryButtonText: {
    color: '#718397',
    fontSize: 12,
    fontWeight: '500',
  },
  vendorLink: {
    alignSelf: 'center',
    marginTop: 16,
    padding: 8,
  },
  vendorLinkText: {
    color: '#087E8B',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
