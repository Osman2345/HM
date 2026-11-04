import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { verifyBackendPayment } from '@/lib/backend';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reference?: string; bookingId?: string }>();
  const [status, setStatus] = useState<string>('processing');
  const [message, setMessage] = useState('Processing your payment update...');

  useEffect(() => {
    const reference = typeof params.reference === 'string' ? params.reference : '';
    const bookingId = typeof params.bookingId === 'string' ? params.bookingId : '';
    let isMounted = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const verify = async () => {
      if (!reference) {
        setStatus('pending');
        setMessage('No payment reference was provided.');
        return;
      }

      let nextStatus = 'pending';
      let verificationError = '';
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const response = await verifyBackendPayment(reference);
          if (!isMounted) return;
          nextStatus = String(response?.data?.status ?? 'pending').toLowerCase();
          verificationError = '';
          setStatus(nextStatus);
          setMessage(
            ['success', 'paid'].includes(nextStatus)
              ? 'Payment verified successfully.'
              : nextStatus === 'failed'
                ? 'Payment was not completed. You can retry from your booking.'
                : 'Payment is being reviewed.',
          );
          if (['success', 'paid', 'failed', 'refunded'].includes(nextStatus)) break;
        } catch (caughtError) {
          if (!isMounted) return;
          verificationError = caughtError instanceof Error ? caughtError.message : 'Verification failed';
          setMessage('Checking payment status…');
        }

        if (attempt < 5) {
          await new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, 2000);
          });
        }
      }

      if (!isMounted) return;
      if (verificationError) {
        setStatus('pending');
        setMessage(verificationError);
      }

      const target = bookingId
        ? { pathname: '/booking/[id]' as const, params: { id: bookingId, paymentReference: reference } }
        : '/';
      router.replace(target);
    };

    void verify();

    return () => {
      isMounted = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [params.bookingId, params.reference, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563EB" />
      <Text style={styles.title}>Payment callback</Text>
      <Text style={styles.subtitle}>
        {params.reference ? `Reference: ${params.reference}` : 'Processing your payment update...'}
      </Text>
      <Text style={styles.caption}>{status}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  title: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 8,
    color: '#475569',
    textAlign: 'center',
  },
  caption: {
    marginTop: 6,
    color: '#2563EB',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  message: {
    marginTop: 8,
    color: '#475569',
    textAlign: 'center',
  },
});
