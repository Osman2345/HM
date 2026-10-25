import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '@/store/auth.store';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string | string[];
    userId?: string | string[];
    otpLength?: string | string[];
    expiresInSeconds?: string | string[];
    bookingHotelId?: string | string[];
    vendor?: string | string[];
  }>();
  const email = Array.isArray(params.email) ? params.email[0] : params.email;
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const otpLengthParam = Array.isArray(params.otpLength) ? params.otpLength[0] : params.otpLength;
  const expiresInSecondsParam = Array.isArray(params.expiresInSeconds)
    ? params.expiresInSeconds[0]
    : params.expiresInSeconds;
  const bookingHotelId = Array.isArray(params.bookingHotelId)
    ? params.bookingHotelId[0]
    : params.bookingHotelId;
  const isVendor = params.vendor === 'true';
  const parsedOtpLength = Number(otpLengthParam);
  const parsedExpiresInSeconds = Number(expiresInSecondsParam);
  const verifySignUpOtp = useAuthStore((state) => state.verifySignUpOtp);
  const resendSignUpOtp = useAuthStore((state) => state.resendSignUpOtp);
  const [token, setToken] = useState('');
  const [currentOtpLength, setCurrentOtpLength] = useState(
    Number.isSafeInteger(parsedOtpLength) && parsedOtpLength > 0 ? parsedOtpLength : 6,
  );
  const [otpType, setOtpType] = useState<'signup' | 'magiclink'>('signup');
  const [secondsRemaining, setSecondsRemaining] = useState(
    Number.isSafeInteger(parsedExpiresInSeconds) && parsedExpiresInSeconds > 0
      ? parsedExpiresInSeconds
      : 3600,
  );
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const otpLength = currentOtpLength;
  const countdownHours = Math.floor(secondsRemaining / 3600);
  const countdownMinutes = Math.floor((secondsRemaining % 3600) / 60);
  const countdownSeconds = secondsRemaining % 60;
  const countdown = [countdownHours, countdownMinutes, countdownSeconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const verify = async () => {
    if (!email) {
      setError('Registration email is missing. Please return to sign up and try again.');
      return;
    }
    if (token.length !== otpLength) {
      setError(`Enter the ${otpLength}-digit code sent to your email.`);
      return;
    }
    if (secondsRemaining === 0) {
      setError('This code has expired. Request a new code to continue.');
      return;
    }

    setBusy('verify');
    setError(null);
    setNotice(null);
    try {
      await verifySignUpOtp(email, token, otpType);
      if (isVendor) {
        router.replace('/(auth)/vendor-pending');
      } else if (bookingHotelId) {
        router.replace({ pathname: '/booking/new', params: { hotelId: bookingHotelId } });
      } else {
        router.replace('/');
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to verify your email.');
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    if (!email || !userId) {
      setError('Registration details are missing. Please return to sign up and try again.');
      return;
    }

    setBusy('resend');
    setError(null);
    setNotice(null);
    try {
      const nextOtpType = await resendSignUpOtp(email, userId);
      setOtpType(nextOtpType.verificationType);
      setCurrentOtpLength(nextOtpType.otpLength);
      setToken('');
      setSecondsRemaining(nextOtpType.expiresInSeconds);
      setNotice('A new verification code has been sent. Check your inbox and spam folder.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to resend the verification code.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.iconCircle}>
          <Ionicons name="mail-outline" size={30} color="#087E8B" />
        </View>
        <Text style={styles.eyebrow}>EMAIL VERIFICATION</Text>
        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.subtitle}>
          Enter the {otpLength}-digit code we sent to{' '}
          <Text style={styles.email}>{email || 'your email address'}</Text>.
        </Text>
        <Text style={styles.deliveryHelp}>
          No email? Check spam. Verification emails are sent by the app backend, so make sure the server is running
          and its SMTP settings are configured.
        </Text>

        <Text style={styles.label}>Verification code</Text>
        <TextInput
          value={token}
          onChangeText={(value) => {
            setToken(value.replace(/\D/g, '').slice(0, otpLength));
            setError(null);
          }}
          style={styles.input}
          placeholder={'0'.repeat(otpLength)}
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={otpLength}
          editable={busy === null}
          accessibilityLabel={`${otpLength}-digit email verification code`}
          returnKeyType="done"
          onSubmitEditing={() => void verify()}
        />
        <Text style={[styles.countdown, secondsRemaining === 0 ? styles.expired : null]}>
          {secondsRemaining > 0 ? `Code expires in ${countdown}` : 'Code expired. Request a new code.'}
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (busy !== null || token.length !== otpLength || !email || secondsRemaining === 0) && styles.disabledButton,
          ]}
          onPress={() => void verify()}
          disabled={busy !== null || token.length !== otpLength || !email || secondsRemaining === 0}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>
            {busy === 'verify' ? 'Verifying…' : 'Verify email'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => void resend()}
          disabled={busy !== null || !email || !userId}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>
            {busy === 'resend' ? 'Sending code…' : 'Resend code'}
          </Text>
        </TouchableOpacity>

        {isVendor ? (
          <Text style={styles.vendorNote}>
            Once verified, you can upload your business licence to complete your vendor application.
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace(isVendor ? '/register-vendor' : '/register')}
        >
          <Text style={styles.backButtonText}>Back to registration</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2F2F1',
    marginBottom: 20,
  },
  eyebrow: {
    color: '#087E8B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: '#17354B',
    fontSize: 29,
    fontWeight: '800',
    marginTop: 8,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 12,
  },
  deliveryHelp: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 22,
  },
  email: {
    color: '#17354B',
    fontWeight: '700',
  },
  label: {
    color: '#17354B',
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 13,
    borderWidth: 1,
    color: '#17354B',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    padding: 15,
    textAlign: 'center',
  },
  countdown: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  expired: {
    color: '#DC2626',
  },
  error: {
    color: '#DC2626',
    marginTop: 10,
    lineHeight: 20,
  },
  notice: {
    color: '#087E8B',
    marginTop: 10,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#087E8B',
    borderRadius: 13,
    marginTop: 20,
    paddingVertical: 15,
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#B8D5D6',
    borderRadius: 13,
    borderWidth: 1,
    marginTop: 11,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#087E8B',
    fontWeight: '700',
  },
  vendorNote: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 20,
    textAlign: 'center',
  },
  backButton: {
    alignItems: 'center',
    marginTop: 23,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#64748B',
    fontWeight: '600',
  },
});
