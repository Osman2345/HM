import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SLStayPayment, { type SLStayPaymentSuccess } from '@/components/SLStayPayment';
import { invalidateCached } from '@/lib/query-cache';
import { supabase } from '@/lib/supabase';
import type { VendorWalletRow } from '@/types/database';

type VendorCommissionWidgetProps = {
  vendorId: string;
};

const formatMoney = (amount: number) =>
  `Le ${Number(amount || 0).toLocaleString('en-SL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function VendorCommissionWidget({ vendorId }: VendorCommissionWidgetProps) {
  const [wallet, setWallet] = useState<VendorWalletRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);

  const loadWallet = useCallback(async (): Promise<VendorWalletRow> => {
    const { data, error: walletError } = await supabase
      .from('vendor_wallets')
      .select('vendor_id, commission_due, total_earnings, can_receive_bookings, created_at, updated_at')
      .eq('vendor_id', vendorId)
      .maybeSingle();
    if (walletError) throw walletError;
    if (!data) throw new Error('Your commission wallet is not available yet.');
    return data as VendorWalletRow;
  }, [vendorId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadWallet()
      .then((walletData) => {
        if (active) {
          setWallet(walletData);
          setError(null);
        }
      })
      .catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : 'Unable to load commission wallet.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadWallet]));

  const payCommission = async (data: SLStayPaymentSuccess) => {
    const { error: paymentError } = await supabase.rpc('pay_vendor_commission_due', {
      p_payment_type: data.method === 'orange' ? 'orange_money' : 'afrimoney',
      p_phone_number: data.phone,
      p_pin: data.pin,
      p_expected_amount: data.amount,
    });
    if (paymentError) throw paymentError;
    try {
      setWallet(await loadWallet());
    } catch (caughtError) {
      setError(caughtError instanceof Error
        ? `Commission payment was recorded, but the wallet could not refresh: ${caughtError.message}`
        : 'Commission payment was recorded, but the wallet could not refresh.');
    }
    invalidateCached(`vendor-dashboard:${vendorId}`);
    setNotice('Commission Paid Successfully - TEST MODE');
  };

  if (loading) {
    return <View style={styles.card}><ActivityIndicator color="#087E8B" /></View>;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Commission Wallet</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {wallet ? (
        <>
          <Text style={styles.value}>Commission Due: {formatMoney(wallet.commission_due)}</Text>
          <Text style={styles.value}>Total Earnings: {formatMoney(wallet.total_earnings)}</Text>
          {!wallet.can_receive_bookings || wallet.commission_due > 500 ? (
            <Text style={styles.blocked}>
              Account blocked: Please clear commission due {formatMoney(wallet.commission_due)} to receive new bookings
            </Text>
          ) : null}
          {wallet.commission_due > 0 ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                setError(null);
                setNotice(null);
                setShowPayment(true);
              }}
            >
              <Text style={styles.buttonText}>Pay Commission Due - Orange Money TEST</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      {showPayment && wallet ? (
        <SLStayPayment
          amount={wallet.commission_due}
          onClose={() => setShowPayment(false)}
          onSuccess={payCommission}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  heading: { color: '#102A36', fontSize: 17, fontWeight: '800' },
  value: { color: '#17354B', fontSize: 14, fontWeight: '700' },
  blocked: { color: '#B42318', backgroundColor: '#FEF3F2', padding: 10, borderRadius: 10, fontSize: 13, fontWeight: '700' },
  button: { alignSelf: 'flex-start', backgroundColor: '#087E8B', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  notice: { color: '#166534', fontWeight: '700' },
  error: { color: '#B42318', fontWeight: '600' },
});
