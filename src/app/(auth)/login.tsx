import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MobileAuthHeader from '@/components/auth/MobileAuthHeader';
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
  const [email, setEmail] = useState('customer@hotelportal.local');
  const [password, setPassword] = useState('password123');
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
      <MobileAuthHeader />
      {vendorAudience && Platform.OS !== 'web' ? (
        <View style={styles.mobileVendorNotice}>
          <Text style={styles.mobileVendorNoticeTitle}>Partner sign in is available on web</Text>
          <Link href="/(tabs)" style={styles.vendorLinkText}>Return to stays</Link>
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={[styles.container, Platform.OS === 'web' && styles.webContainer]}
        keyboardShouldPersistTaps="handled"
      >
        {Platform.OS === 'web' ? (
          <Text style={styles.title}>{vendorAudience ? 'Partner sign in' : 'Welcome back'}</Text>
        ) : null}
        <Text style={styles.subtitle}>
          {vendorAudience ? 'Sign in to manage your property and bookings.' : 'Sign in to continue'}
        </Text>
        {vendorApplicationIncomplete ? (
          <Text style={styles.notice}>
            Your account was created. After confirming your email and signing in, you can finish uploading your business licence.
          </Text>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" style={styles.input} />
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
        <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" style={styles.input} />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.primaryButton} onPress={() => void submit()}>
          <Text style={styles.primaryButtonText}>Log in</Text>
        </TouchableOpacity>

        <Link
          href={bookingHotelId ? { pathname: '/register', params: { bookingHotelId } } : '/register'}
          asChild
        >
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Create account</Text>
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
    backgroundColor: '#F8FAFC',
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
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
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
  label: {
    color: '#0F172A',
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
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '700',
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
