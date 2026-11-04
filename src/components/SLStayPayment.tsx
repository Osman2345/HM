import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type PaymentMethod = 'orange' | 'afri';
type PaymentView = 'choose' | 'number' | 'pin' | 'success';

export interface SLStayPaymentSuccess {
  method: PaymentMethod;
  phone: string;
  amount: number;
  pin: string;
}

interface SLStayPaymentProps {
  amount: number;
  onSuccess: (data: SLStayPaymentSuccess) => Promise<void>;
  onClose: () => void;
}

export default function SLStayPayment({ amount, onSuccess, onClose }: SLStayPaymentProps) {
  const [view, setView] = useState<PaymentView>('choose');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOrange = method === 'orange';
  const themeColor = isOrange ? '#FF7900' : '#E30613';
  const themeName = isOrange ? 'Orange Money' : 'Afrimoney';
  const normalizedPhone = phone.replace(/[\s-]/g, '');

  const chooseMethod = (nextMethod: PaymentMethod) => {
    setMethod(nextMethod);
    setError(null);
    setView('number');
  };

  const handlePay = async () => {
    if (!method || normalizedPhone.length < 8) {
      setError('Enter a valid mobile money number.');
      return;
    }
    if (pin !== '1234') {
      setError('Invalid TEST PIN. Use 1234.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSuccess({ method, phone: normalizedPhone, amount, pin });
      setView('success');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to confirm TEST payment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!loading) onClose();
      }}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            {view === 'choose' ? (
              <View style={styles.content}>
                <Text style={styles.title}>Choose Payment Method</Text>
                <Text style={styles.subtitle}>SL STAY · Secure TEST payments</Text>
                <View style={styles.methodList}>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.methodButton, styles.orangeButton]}
                    onPress={() => chooseMethod('orange')}
                  >
                    <Text style={styles.orangeLogo}>O</Text>
                    <Text style={styles.methodButtonText}>Orange Money</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.methodButton, styles.afriButton]}
                    onPress={() => chooseMethod('afri')}
                  >
                    <Ionicons name="phone-portrait-outline" size={23} color="#FFFFFF" />
                    <Text style={styles.methodButtonText}>Afrimoney</Text>
                  </Pressable>
                </View>
                <Pressable accessibilityRole="button" onPress={onClose} style={styles.textButton}>
                  <Text style={styles.textButtonLabel}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}

            {view === 'number' || view === 'pin' ? (
              <>
                <View style={[styles.header, { backgroundColor: themeColor }]}>
                  <Text style={styles.headerTitle}>{themeName}</Text>
                  <Text style={styles.testBadge}>TEST</Text>
                </View>

                {view === 'number' ? (
                  <View style={styles.content}>
                    <Text style={styles.label}>Enter {themeName} Number</Text>
                    <TextInput
                      accessibilityLabel={`${themeName} number`}
                      style={styles.phoneInput}
                      value={phone}
                      onChangeText={(value) => {
                        setPhone(value);
                        setError(null);
                      }}
                      placeholder={isOrange ? '076 123456' : '088 123456'}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      maxLength={18}
                    />
                    <Text style={styles.hint}>TEST: Any number, for example 076123456</Text>
                    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.primaryButton, { backgroundColor: themeColor }]}
                      onPress={() => {
                        if (normalizedPhone.length < 8) {
                          setError('Enter a valid mobile money number.');
                          return;
                        }
                        setError(null);
                        setView('pin');
                      }}
                    >
                      <Text style={styles.primaryButtonText}>Continue</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setView('choose')} style={styles.textButton}>
                      <Text style={styles.textButtonLabel}>Back</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.content}>
                    <Text style={styles.merchant}>Merchant: <Text style={styles.strong}>SL STAY</Text></Text>
                    <Text style={styles.maskedPhone}>Number: {normalizedPhone.slice(0, 3)} ****{normalizedPhone.slice(-2)}</Text>
                    <Text style={styles.amount}>Le {amount.toLocaleString('en-SL')} <Text style={styles.testSuffix}>(TEST)</Text></Text>
                    <View style={styles.divider} />
                    <Text style={styles.label}>Enter PIN</Text>
                    <TextInput
                      accessibilityLabel="TEST payment PIN"
                      style={[styles.pinInput, { borderColor: themeColor }]}
                      value={pin}
                      onChangeText={(value) => {
                        setPin(value.replace(/\D/g, '').slice(0, 4));
                        setError(null);
                      }}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={4}
                      placeholder="••••"
                    />
                    <Text style={styles.hint}>Use 1234 for TEST</Text>
                    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.primaryButton, styles.confirmButton, { backgroundColor: themeColor }, loading && styles.disabled]}
                      onPress={() => void handlePay()}
                      disabled={loading}
                    >
                      {loading ? <ActivityIndicator color="#FFFFFF" /> : null}
                      <Text style={styles.primaryButtonText}>{loading ? 'Processing TEST payment…' : 'Confirm'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setView('number')} style={styles.textButton} disabled={loading}>
                      <Text style={styles.textButtonLabel}>Cancel</Text>
                    </Pressable>
                    <Text style={styles.footer}>TEST MODE · No real money is deducted.</Text>
                  </View>
                )}
              </>
            ) : null}

            {view === 'success' ? (
              <View style={styles.successContent}>
                <View style={styles.successIcon}><Ionicons name="checkmark" size={32} color="#15803D" /></View>
                <Text style={styles.successTitle}>Payment Successful</Text>
                <Text style={styles.successSubtitle}>Le {amount.toLocaleString('en-SL')} (TEST) via {themeName}</Text>
                <Text style={styles.successPhone}>{phone}</Text>
                <Pressable accessibilityRole="button" style={styles.doneButton} onPress={onClose}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)', padding: 18 },
  modalCard: { width: '100%', maxWidth: 380, alignSelf: 'center', overflow: 'hidden', borderRadius: 24, backgroundColor: '#FFFFFF', elevation: 18 },
  content: { padding: 24 },
  title: { color: '#111827', fontSize: 20, fontWeight: '800' },
  subtitle: { marginTop: 5, color: '#6B7280', fontSize: 12 },
  methodList: { gap: 14, marginTop: 28 },
  methodButton: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 18 },
  orangeButton: { backgroundColor: '#FF7900' },
  afriButton: { backgroundColor: '#E30613' },
  orangeLogo: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', color: '#FF7900', fontSize: 16, fontWeight: '800', textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden' },
  methodButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  header: { minHeight: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18 },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  testBadge: { overflow: 'hidden', borderRadius: 999, backgroundColor: '#FDE047', paddingHorizontal: 10, paddingVertical: 5, color: '#111827', fontSize: 10, fontWeight: '900' },
  label: { color: '#4B5563', fontSize: 13, fontWeight: '600' },
  phoneInput: { marginTop: 9, borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 12, padding: 13, color: '#111827', fontSize: 17, textAlign: 'center' },
  pinInput: { marginTop: 8, borderWidth: 2, borderRadius: 12, padding: 12, color: '#111827', fontSize: 23, letterSpacing: 10, textAlign: 'center' },
  hint: { marginTop: 8, color: '#9CA3AF', fontSize: 11, textAlign: 'center' },
  error: { marginTop: 9, color: '#B91C1C', fontSize: 12, textAlign: 'center' },
  primaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 18, borderRadius: 12, paddingHorizontal: 14 },
  confirmButton: { flexDirection: 'row', gap: 9 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.65 },
  textButton: { alignItems: 'center', paddingVertical: 13 },
  textButtonLabel: { color: '#6B7280', fontSize: 13 },
  merchant: { color: '#6B7280', fontSize: 12, textAlign: 'center' },
  strong: { color: '#111827', fontWeight: '800' },
  maskedPhone: { marginTop: 5, color: '#6B7280', fontSize: 12, textAlign: 'center' },
  amount: { marginTop: 18, color: '#111827', fontSize: 34, fontWeight: '900', textAlign: 'center' },
  testSuffix: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  divider: { height: 1, marginVertical: 17, backgroundColor: '#E5E7EB' },
  footer: { marginTop: 16, color: '#9CA3AF', fontSize: 10, textAlign: 'center' },
  successContent: { alignItems: 'center', padding: 30 },
  successIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 32, backgroundColor: '#DCFCE7' },
  successTitle: { marginTop: 16, color: '#111827', fontSize: 20, fontWeight: '800' },
  successSubtitle: { marginTop: 8, color: '#6B7280', fontSize: 13, textAlign: 'center' },
  successPhone: { marginTop: 5, color: '#9CA3AF', fontSize: 12 },
  doneButton: { width: '100%', minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 24, borderRadius: 12, backgroundColor: '#111827' },
  doneButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
