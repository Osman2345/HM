import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { WalletSummaryRow, WithdrawalProvider } from '@/types/database';
import { supabase } from '@/lib/supabase';

type DialogMode = 'method' | 'withdrawal' | null;

const formatMoney = (value: number) => `Le ${Number(value || 0).toLocaleString('en-SL', { maximumFractionDigits: 2 })}`;
const providerName = (provider: WithdrawalProvider) => provider === 'orange_money' ? 'Orange Money' : 'AfriMoney';
const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
};

export default function WalletControls() {
  const [wallet, setWallet] = useState<WalletSummaryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [provider, setProvider] = useState<WithdrawalProvider>('orange_money');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: walletError } = await supabase.rpc('get_my_wallet_summary');
      if (walletError) throw walletError;
      const current = data?.[0] ?? null;
      setWallet(current);
      setProvider(current?.provider ?? 'orange_money');
      setPhone(current?.phone_number ?? '');
    } catch (caughtError) {
      setWallet(null);
      setProvider('orange_money');
      setPhone('');
      setError(errorMessage(caughtError, 'Unable to load your wallet.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadWallet();
  }, [loadWallet]));

  const saveMethod = async () => {
    if (!phone.trim()) {
      setError('Enter the mobile money number for withdrawals.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: saveError } = await supabase.rpc('save_withdrawal_method', {
        p_provider: provider,
        p_phone_number: phone.trim(),
      });
      if (saveError) throw saveError;
      setDialog(null);
      setNotice('Withdrawal method saved.');
      await loadWallet();
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to save the withdrawal method.'));
    } finally {
      setBusy(false);
    }
  };

  const requestWithdrawal = async () => {
    const normalizedAmount = amount.trim();
    const value = Number(normalizedAmount);
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedAmount) || !Number.isFinite(value) || value <= 0) {
      setError('Enter a valid withdrawal amount greater than zero with no more than two decimal places.');
      return;
    }
    if (value > Number(wallet?.available_balance ?? 0)) {
      setError('Withdrawal amount exceeds your available balance.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: requestError } = await supabase.rpc('request_withdrawal', { p_amount: value });
      if (requestError) throw requestError;
      setDialog(null);
      setAmount('');
      setNotice('Withdrawal request submitted for admin processing.');
      await loadWallet();
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Unable to submit the withdrawal request.'));
    } finally {
      setBusy(false);
    }
  };

  const openMethodDialog = () => {
    setError(null);
    setNotice(null);
    setDialog('method');
  };

  const openWithdrawalDialog = () => {
    setError(null);
    setNotice(null);
    setAmount(String(wallet?.available_balance ?? ''));
    setDialog('withdrawal');
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.walletIcon}><Ionicons name="wallet-outline" size={20} color="#087E8B" /></View>
        <View style={styles.walletHeading}>
          <Text style={styles.eyebrow}>AVAILABLE BALANCE</Text>
          {loading ? <ActivityIndicator size="small" color="#087E8B" /> : <Text style={styles.balance}>{formatMoney(wallet?.available_balance ?? 0)}</Text>}
        </View>
        <TouchableOpacity accessibilityRole="button" style={styles.refreshButton} onPress={() => void loadWallet()} disabled={loading}>
          <Ionicons name="refresh-outline" size={17} color="#087E8B" />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>Earned {formatMoney(wallet?.earned_balance ?? 0)}</Text>
        <Text style={styles.summaryText}>Reserved {formatMoney(wallet?.reserved_withdrawals ?? 0)}</Text>
      </View>
      <View style={styles.methodRow}>
        <Ionicons name="phone-portrait-outline" size={15} color="#718397" />
        <Text style={styles.methodText} numberOfLines={1}>
          {wallet?.provider && wallet.phone_number
            ? `${providerName(wallet.provider)} · ${wallet.phone_number}`
            : 'No withdrawal method added'}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity accessibilityRole="button" style={styles.methodButton} onPress={openMethodDialog}>
          <Ionicons name="add-circle-outline" size={16} color="#087E8B" />
          <Text style={styles.methodButtonText}>{wallet?.provider ? 'Update withdrawal method' : 'Add withdrawal method'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.withdrawButton, (loading || !wallet?.provider || Number(wallet.available_balance) <= 0) && styles.buttonDisabled]}
          onPress={openWithdrawalDialog}
          disabled={loading || !wallet?.provider || Number(wallet.available_balance) <= 0 || busy}
        >
          <Ionicons name="arrow-up-circle-outline" size={16} color="#FFFFFF" />
          <Text style={styles.withdrawButtonText}>Withdraw</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      <Text style={styles.helper}>Transfers are requested here and marked paid by an admin after the mobile-money transfer is completed.</Text>

      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={() => {
        if (!busy) setDialog(null);
      }}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{dialog === 'method' ? 'Withdrawal method' : 'Request withdrawal'}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => !busy && setDialog(null)} disabled={busy}>
                  <Ionicons name="close" size={22} color="#526974" />
                </TouchableOpacity>
              </View>
              {dialog === 'method' ? (
                <>
                  <Text style={styles.label}>Mobile money provider</Text>
                  <View style={styles.providerOptions}>
                    {(['orange_money', 'afri_money'] as const).map((item) => (
                      <TouchableOpacity
                        key={item}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: provider === item }}
                        style={[styles.providerOption, provider === item && styles.providerSelected]}
                        onPress={() => setProvider(item)}
                        disabled={busy}
                      >
                        <Text style={[styles.providerText, provider === item && styles.providerTextSelected]}>{providerName(item)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.label}>Mobile money number</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="e.g. +232 76 123456"
                    accessibilityLabel="Mobile money withdrawal number"
                    style={styles.input}
                    editable={!busy}
                  />
                  <Text style={styles.modalHint}>Only you and administrators can view this saved method.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Amount in Sierra Leonean leones (SLE)</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Withdrawal amount in leones"
                    style={styles.input}
                    editable={!busy}
                  />
                  <Text style={styles.modalHint}>Available: {formatMoney(wallet?.available_balance ?? 0)} · Sending to {providerName(wallet?.provider ?? provider)} {wallet?.phone_number ?? phone}</Text>
                </>
              )}
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy}
                style={[styles.modalPrimary, busy && styles.buttonDisabled]}
                onPress={() => void (dialog === 'method' ? saveMethod() : requestWithdrawal())}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
                <Text style={styles.withdrawButtonText}>{busy ? 'Saving…' : dialog === 'method' ? 'Save method' : 'Submit withdrawal request'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderWidth: 1, borderColor: '#DDE6E9', borderRadius: 9, backgroundColor: '#FFFFFF' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  walletIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E8F5F3' },
  walletHeading: { flex: 1, gap: 3 },
  eyebrow: { color: '#718397', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  balance: { color: '#17354B', fontSize: 22, fontWeight: '900' },
  refreshButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDE6E9', borderRadius: 7 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  summaryText: { color: '#526974', fontSize: 11, fontWeight: '600' },
  methodRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7 },
  methodText: { flex: 1, color: '#526974', fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#B9DCDD', borderRadius: 6 },
  methodButtonText: { color: '#087E8B', fontSize: 11, fontWeight: '800' },
  withdrawButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#087E8B' },
  withdrawButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
  helper: { color: '#82909B', fontSize: 10, lineHeight: 15 },
  error: { color: '#B42318', fontSize: 11 },
  notice: { color: '#027A48', fontSize: 11, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(17, 35, 44, 0.48)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 11, padding: 18, borderRadius: 10, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { color: '#17354B', fontSize: 17, fontWeight: '800' },
  label: { color: '#344054', fontSize: 11, fontWeight: '700' },
  providerOptions: { flexDirection: 'row', gap: 8 },
  providerOption: { minHeight: 40, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDE6E9', borderRadius: 6 },
  providerSelected: { borderColor: '#087E8B', backgroundColor: '#F2FAFA' },
  providerText: { color: '#526974', fontSize: 11, fontWeight: '700' },
  providerTextSelected: { color: '#087E8B' },
  input: { minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, color: '#17354B', fontSize: 13 },
  modalHint: { color: '#718397', fontSize: 10, lineHeight: 15 },
  modalPrimary: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 6, borderRadius: 6, backgroundColor: '#087E8B' },
});