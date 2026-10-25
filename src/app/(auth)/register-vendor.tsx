import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MobileAuthHeader from '@/components/auth/MobileAuthHeader';
import { useAuthStore } from '@/store/auth.store';

const vendorTermsVersion = 'sl-stay-vendor-terms-2026-10';

const vendorRules = [
  {
    title: 'Provide genuine business details',
    detail: 'Use your real name and business name, and submit a current business licence or a clear photo of it. We may verify the details before approving your vendor account.',
  },
  {
    title: 'List your accommodation accurately',
    detail: 'Use truthful descriptions, current photos, correct prices, available rooms, amenities, and check-in information. Do not impersonate another property or mislead guests.',
  },
  {
    title: 'Honor confirmed reservations',
    detail: 'Keep your availability up to date, respond to booking requests promptly, and honor accepted bookings. Communicate changes or cancellations honestly and as early as possible.',
  },
  {
    title: 'Treat guests fairly and protect their information',
    detail: 'Follow applicable laws, do not discriminate or use fake reviews, and keep guests’ personal and payment information private.',
  },
  {
    title: 'Wait for verification before listing',
    detail: 'Vendor accounts and properties may be reviewed before they become active. SL Stay may reject or suspend accounts or listings for false information or rule violations.',
  },
];

export default function RegisterVendorScreen() {
  const router = useRouter();
  const signUp = useAuthStore((state) => state.signUp);
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);

    if (!businessName.trim() || !fullName.trim() || !email.trim() || !password.trim()) {
      setError('Please complete all fields.');
      return;
    }
    if (!acceptedTerms) {
      setError('Please read and accept the SL Stay vendor rules.');
      return;
    }

    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const verification = await signUp(normalizedEmail, password, fullName.trim(), 'vendor', {
        businessName: businessName.trim(),
        termsVersion: vendorTermsVersion,
      });

      router.replace({
        pathname: '/(auth)/verify-email',
        params: {
          email: normalizedEmail,
          userId: verification.userId,
          otpLength: String(verification.otpLength),
          expiresInSeconds: String(verification.expiresInSeconds),
          vendor: 'true',
        },
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to register your vendor account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <MobileAuthHeader />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Ionicons name="bed" size={22} color="#FFFFFF" /></View>
        <Text style={styles.eyebrow}>SL STAY PARTNERS</Text>
        <Text style={styles.title}>Create your vendor account</Text>
        <Text style={styles.subtitle}>Tell us about your business and verify your property. Your details stay private while we review your application.</Text>

        <Text style={styles.label}>Business name</Text>
        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="e.g. Ocean View Guest House"
          placeholderTextColor="#8A9AA6"
          style={styles.input}
          autoCapitalize="words"
        />
        <Text style={styles.label}>Primary contact name</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your full name"
          placeholderTextColor="#8A9AA6"
          style={styles.input}
          autoCapitalize="words"
        />
        <Text style={styles.label}>Business email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@yourbusiness.com"
          placeholderTextColor="#8A9AA6"
          style={styles.input}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Create a password"
          placeholderTextColor="#8A9AA6"
          style={styles.input}
        />

        <Text style={styles.sectionTitle}>Business licence</Text>
        <Text style={styles.helper}>After verifying your email, you will be prompted to upload a clear photo or PDF of your business licence or registration document.</Text>

        <Text style={styles.sectionTitle}>SL Stay vendor rules</Text>
        <Text style={styles.helper}>Please review these requirements before you create your account.</Text>
        <View style={styles.policyCard}>
          <ScrollView nestedScrollEnabled style={styles.policyScroll} showsVerticalScrollIndicator>
            {vendorRules.map((rule, index) => (
              <View key={rule.title} style={styles.policyItem}>
                <View style={styles.policyNumber}><Text style={styles.policyNumberText}>{index + 1}</Text></View>
                <View style={styles.policyCopy}>
                  <Text style={styles.policyTitle}>{rule.title}</Text>
                  <Text style={styles.policyDetail}>{rule.detail}</Text>
                </View>
              </View>
            ))}
            <Text style={styles.policyNote}>These are the core marketplace requirements for vendor onboarding. They do not replace any laws or licences that apply to your business.</Text>
          </ScrollView>
        </View>

        <TouchableOpacity
          style={styles.agreementRow}
          onPress={() => setAcceptedTerms((current) => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptedTerms }}
          accessibilityLabel="I have read and agree to the SL Stay vendor rules"
        >
          <View style={[styles.checkbox, acceptedTerms ? styles.checkboxSelected : null]}>
            {acceptedTerms ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
          </View>
          <Text style={styles.agreementText}>I have read and agree to the SL Stay vendor rules and confirm that my business information is accurate.</Text>
        </TouchableOpacity>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, busy ? styles.disabledButton : null]}
          onPress={() => void submit()}
          disabled={busy}
        >
          <Text style={styles.primaryButtonText}>{busy ? 'Creating account…' : 'Agree & continue'}</Text>
        </TouchableOpacity>

        <Link href="/login" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to sign in</Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  container: {
    flexGrow: 1,
    padding: 22,
    paddingBottom: 36,
    backgroundColor: '#F5F7F8',
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    marginBottom: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
  },
  eyebrow: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    marginTop: 7,
    color: '#17354B',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 19,
    color: '#667783',
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    marginBottom: 6,
    color: '#2F4655',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    minHeight: 47,
    marginBottom: 13,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#DEE6E8',
    borderRadius: 11,
    color: '#17354B',
    backgroundColor: '#FFFFFF',
    fontSize: 14,
  },
  sectionTitle: {
    marginTop: 12,
    color: '#17354B',
    fontSize: 17,
    fontWeight: '800',
  },
  helper: {
    marginTop: 5,
    marginBottom: 10,
    color: '#718397',
    fontSize: 12,
    lineHeight: 18,
  },
  policyCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E1E8EA',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  policyScroll: {
    maxHeight: 252,
    paddingHorizontal: 13,
  },
  policyItem: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EDEF',
  },
  policyNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF4F4',
  },
  policyNumberText: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
  },
  policyCopy: {
    flex: 1,
  },
  policyTitle: {
    color: '#294556',
    fontSize: 12,
    fontWeight: '800',
  },
  policyDetail: {
    marginTop: 4,
    color: '#6D7E88',
    fontSize: 11,
    lineHeight: 16,
  },
  policyNote: {
    paddingVertical: 12,
    color: '#82919A',
    fontSize: 10,
    lineHeight: 15,
  },
  agreementRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#91A4AD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    borderColor: '#087E8B',
    backgroundColor: '#087E8B',
  },
  agreementText: {
    flex: 1,
    color: '#3D5360',
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    marginTop: 10,
    color: '#B42318',
    fontSize: 12,
    lineHeight: 17,
  },
  primaryButton: {
    minHeight: 49,
    marginTop: 17,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 46,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D6E0E2',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#415866',
    fontSize: 13,
    fontWeight: '700',
  },
});
