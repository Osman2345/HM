import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MobileAuthHeader from '@/components/auth/MobileAuthHeader';
import MobileAuthHero from '@/components/auth/MobileAuthHero';
import { useAuthStore } from '@/store/auth.store';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    bookingHotelId?: string | string[];
    vendorApplicationIncomplete?: string | string[];
    audience?: string | string[];
  }>();
  const bookingHotelId = typeof params.bookingHotelId === 'string' ? params.bookingHotelId : undefined;
  const vendorApplicationIncomplete = params.vendorApplicationIncomplete === 'true';
  const vendorAudience = params.audience === 'vendor';
  const signIn = useAuthStore((state: { signIn: (email: string, password: string) => Promise<void> }) => state.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await signIn(email, password);
      if (bookingHotelId) {
        router.replace({ pathname: '/booking/new', params: { hotelId: bookingHotelId } });
        return;
      }

      router.replace('/');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to sign in');
    }
  };

  return (
    <View style={styles.screen}>
      {Platform.OS === 'web' ? <MobileAuthHeader /> : <MobileAuthHero />}
      {vendorAudience && Platform.OS !== 'web' ? (
        <View style={styles.mobileVendorNotice}>
          <Text style={styles.mobileVendorNoticeTitle}>Partner sign in is available on web</Text>
          <Link href="/(tabs)" style={styles.vendorLinkText}>Return to stays</Link>
        </View>
      ) : (
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
          {Platform.OS === 'web'
            ? vendorAudience ? 'Partner sign in' : 'Welcome back'
            : 'Sign in'}
        </Text>
        <Text style={styles.subtitle}>
          {vendorAudience ? 'Sign in to manage your property and bookings.' : 'Sign in to continue'}
        </Text>
        {vendorApplicationIncomplete ? (
          <Text style={styles.notice}>
            Your account was created. After confirming your email and signing in, you can finish uploading your business licence.
          </Text>
        ) : null}

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
        <View style={styles.passwordLabelRow}>
          <Text style={styles.label}>Password</Text>
          <Link
            href={bookingHotelId
              ? { pathname: '/forgot-password', params: { bookingHotelId } }
              : '/forgot-password'}
            style={styles.forgotPasswordLink}
          >
            Forgot password?
          </Link>
        </View>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          placeholder="Enter your password"
          placeholderTextColor="#94A3A8"
          style={StyleSheet.flatten([styles.input, Platform.OS !== 'web' && styles.mobileInput])}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={StyleSheet.flatten([styles.primaryButton, Platform.OS !== 'web' && styles.mobilePrimaryButton])}
          onPress={() => void submit()}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Log in</Text>
        </TouchableOpacity>

        <Link
          href={bookingHotelId ? { pathname: '/register', params: { bookingHotelId } } : '/register'}
          asChild
        >
          <TouchableOpacity style={StyleSheet.flatten([styles.secondaryButton, Platform.OS !== 'web' && styles.mobileSecondaryButton])}>
            <Text style={StyleSheet.flatten([styles.secondaryButtonText, Platform.OS !== 'web' && styles.mobileSecondaryButtonText])}>
              {Platform.OS === 'web' ? 'Create account' : "Don't have an account? Sign up"}
            </Text>
          </TouchableOpacity>
        </Link>

        {Platform.OS === 'web' ? (
          <Link href={vendorAudience ? '/register-vendor' : '/login?audience=vendor'} asChild>
            <TouchableOpacity style={styles.vendorLink}>
              <Text style={styles.vendorLinkText}>
                {vendorAudience ? 'New partner? Create a vendor account' : 'Sign in as a vendor'}
              </Text>
            </TouchableOpacity>
          </Link>
        ) : null}
      </ScrollView>
      )}
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
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileTitle: {
    color: '#17354B',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    color: '#475569',
    fontSize: 16,
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
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forgotPasswordLink: {
    color: '#087E8B',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
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
  mobileVendorNotice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 28,
    backgroundColor: '#F8FAFC',
  },
  mobileVendorNoticeTitle: {
    color: '#17354B',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  error: {
    color: '#DC2626',
    marginBottom: 8,
  },
  notice: {
    color: '#285464',
    backgroundColor: '#EAF4F4',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    lineHeight: 19,
  },
});
