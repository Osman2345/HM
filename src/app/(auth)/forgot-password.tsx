import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MobileAuthHeader from '@/components/auth/MobileAuthHeader';
import { useAuthStore } from '@/store/auth.store';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ bookingHotelId?: string | string[] }>();
  const bookingHotelId = typeof params.bookingHotelId === 'string' ? params.bookingHotelId : undefined;
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address to receive your reset link.');
      return;
    }

    setBusy(true);
    try {
      await resetPassword(normalizedEmail, Linking.createURL('/reset-password'));
      setEmail(normalizedEmail);
      setSent(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to send a reset link right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <MobileAuthHeader />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.iconBadge}>
            <Ionicons name={sent ? 'mail-open-outline' : 'lock-closed-outline'} size={28} color="#087E8B" />
          </View>
          <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
          <Text style={styles.title}>{sent ? 'Check your inbox' : 'Forgot your password?'}</Text>
          <Text style={styles.description}>
            {sent
              ? `If an account exists for ${email}, we’ve sent a secure link to reset its password. Check your inbox and spam folder.`
              : 'Enter the email address linked to your account. We’ll email you a secure link to choose a new password.'}
          </Text>

          {!sent ? (
            <>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                accessibilityLabel="Email address"
                returnKeyType="send"
                onSubmitEditing={() => void submit()}
              />
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, busy ? styles.disabledButton : null]}
                onPress={() => void submit()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Send reset link</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                setSent(false);
                setError(null);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Try another email</Text>
            </TouchableOpacity>
          )}

          <Link
            href={bookingHotelId ? { pathname: '/login', params: { bookingHotelId } } : '/login'}
            style={styles.backLink}
          >
            <Ionicons name="arrow-back" size={16} color="#475569" />
            <Text style={styles.backLinkText}>Back to sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F1F6F7',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 28,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAEC',
    shadowColor: '#123A50',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5F3',
    marginBottom: 22,
  },
  eyebrow: {
    color: '#087E8B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 9,
  },
  title: {
    color: '#123A50',
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
    marginBottom: 10,
  },
  description: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 26,
  },
  label: {
    color: '#123A50',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D7E1E4',
    borderRadius: 13,
    paddingHorizontal: 15,
    color: '#0F172A',
    backgroundColor: '#FBFDFD',
    fontSize: 15,
  },
  error: {
    color: '#B42318',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 9,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
    marginTop: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.65,
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#D7E1E4',
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: '#123A50',
    fontSize: 14,
    fontWeight: '700',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    marginTop: 24,
    padding: 6,
  },
  backLinkText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
});
