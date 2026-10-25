import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    access_token?: string | string[];
    refresh_token?: string | string[];
    type?: string | string[];
  }>();
  const url = Linking.useLinkingURL();
  const hashParams = new URLSearchParams(url?.split('#', 2)[1] ?? '');
  const code = typeof params.code === 'string' ? params.code : undefined;
  const accessToken = typeof params.access_token === 'string'
    ? params.access_token
    : hashParams.get('access_token') ?? undefined;
  const refreshToken = typeof params.refresh_token === 'string'
    ? params.refresh_token
    : hashParams.get('refresh_token') ?? undefined;
  const recoveryType = typeof params.type === 'string' ? params.type : hashParams.get('type') ?? undefined;
  const exchangeCode = useAuthStore((state) => state.exchangePasswordResetCode);
  const setRecoverySession = useAuthStore((state) => state.setPasswordRecoverySession);
  const updatePassword = useAuthStore((state) => state.updatePassword);
  const [verifying, setVerifying] = useState(
    Boolean(code || (accessToken && refreshToken && recoveryType === 'recovery')),
  );
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    let verification: Promise<void> | null = null;
    if (code) {
      verification = exchangeCode(code);
    } else if (accessToken && refreshToken && recoveryType === 'recovery') {
      verification = setRecoverySession(accessToken, refreshToken);
    }

    if (!verification) {
      return () => {
        active = false;
      };
    }

    void verification
      .then(() => {
        if (active) {
          setVerified(true);
          setError(null);
        }
      })
      .catch((caughtError: unknown) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : 'This reset link is invalid or has expired.');
        }
      })
      .finally(() => {
        if (active) {
          setVerifying(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, code, exchangeCode, recoveryType, refreshToken, setRecoverySession]);

  const submit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      router.replace('/');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update your password.');
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
            <Ionicons name="key-outline" size={28} color="#087E8B" />
          </View>
          <Text style={styles.eyebrow}>SECURE YOUR ACCOUNT</Text>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.description}>Create a strong password you haven’t used for this account before.</Text>

          {verifying ? (
            <View style={styles.status}>
              <ActivityIndicator color="#087E8B" />
              <Text style={styles.statusText}>Verifying your secure reset link…</Text>
            </View>
          ) : verified ? (
            <>
              <Text style={styles.label}>New password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 8 characters"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                accessibilityLabel="New password"
              />
              <Text style={[styles.label, styles.confirmLabel]}>Confirm new password</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="Enter your new password again"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                accessibilityLabel="Confirm new password"
                returnKeyType="done"
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
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Update password</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.errorPanel}>
                <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
                <Text accessibilityRole="alert" style={styles.errorPanelText}>
                  {error ?? 'This reset link is invalid or has expired. Request a new link to continue.'}
                </Text>
              </View>
              <Link href="/forgot-password" style={styles.primaryLink}>
                Request a new reset link
              </Link>
            </>
          )}
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
  confirmLabel: {
    marginTop: 16,
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
  errorPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#FEF3F2',
    padding: 14,
    marginBottom: 16,
  },
  errorPanelText: {
    flex: 1,
    color: '#912018',
    fontSize: 13,
    lineHeight: 20,
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
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    color: '#475569',
    fontSize: 14,
  },
  primaryLink: {
    color: '#087E8B',
    fontSize: 14,
    fontWeight: '700',
    alignSelf: 'center',
    padding: 8,
  },
});
