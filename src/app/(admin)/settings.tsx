import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { loadPlatformSettings, savePlatformSettings, type PlatformSettings } from '@/lib/backend';

type CommissionType = PlatformSettings['commission_type'];

export default function AdminSettingsScreen() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [commissionType, setCommissionType] = useState<CommissionType>('percentage');
  const [commissionValue, setCommissionValue] = useState('15');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const current = await loadPlatformSettings();
      setSettings(current);
      setCommissionType(current.commission_type);
      setCommissionValue(String(current.commission_value));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load platform settings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => void loadSettings(), 0);
    return () => clearTimeout(timeout);
  }, [loadSettings]);

  const save = async () => {
    const value = Number(commissionValue);
    if (!Number.isFinite(value)) {
      setError('Enter a valid commission value.');
      return;
    }
    if (commissionType === 'percentage' && (value < 5 || value > 30)) {
      setError('Percentage commission must be between 5% and 30%.');
      return;
    }
    if (commissionType === 'fixed_amount' && value < 0) {
      setError('Fixed commission cannot be negative.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await savePlatformSettings({
        commission_type: commissionType,
        commission_value: value,
        currency: 'SLE',
      });
      setSettings(updated);
      setCommissionValue(String(updated.commission_value));
      setMessage('Booking commission settings saved.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to save platform settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadSettings(true)} />}
    >
      <View style={styles.pageHeading}>
        <View>
          <Text style={styles.eyebrow}>PLATFORM CONTROLS</Text>
          <Text style={styles.heading}>Settings</Text>
          <Text style={styles.subtitle}>Manage charges applied to customer bookings.</Text>
        </View>
        <View style={styles.headingIcon}><Ionicons name="settings-outline" size={21} color="#087E8B" /></View>
      </View>

      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}><Ionicons name="wallet-outline" size={19} color="#087E8B" /></View>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>Booking Commission &amp; Charges</Text>
          <Text style={styles.sectionSubtitle}>One platform-wide commission rate applies to every vendor booking.</Text>
        </View>
      </View>

      {loading ? <ActivityIndicator style={styles.loading} color="#087E8B" /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}

      {!loading ? (
        <View style={styles.form}>
          <Text style={styles.label}>Commission type</Text>
          <View style={styles.segmentedControl}>
            {([
              ['percentage', 'Percentage'],
              ['fixed_amount', 'Fixed amount'],
            ] as const).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: commissionType === value }}
                style={[styles.segment, commissionType === value && styles.segmentSelected]}
                onPress={() => setCommissionType(value)}
              >
                <Text style={[styles.segmentText, commissionType === value && styles.segmentTextSelected]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{commissionType === 'percentage' ? 'Commission percentage' : 'Fixed charge per paid booking'}</Text>
          <View style={styles.valueField}>
            <TextInput
              value={commissionValue}
              onChangeText={setCommissionValue}
              keyboardType="decimal-pad"
              accessibilityLabel={commissionType === 'percentage' ? 'Commission percentage' : 'Fixed commission amount'}
              style={styles.valueInput}
              editable={!saving}
            />
            <Text style={styles.valueSuffix}>{commissionType === 'percentage' ? '%' : 'Le'}</Text>
          </View>
          {commissionType === 'percentage' ? (
            <Text style={styles.hint}>Enter a value between 5% and 30%.</Text>
          ) : (
            <Text style={styles.hint}>A fixed amount is deducted once per paid booking, up to the booking total.</Text>
          )}

          <Text style={styles.label}>Currency</Text>
          <View style={styles.currencyRow}>
            <View style={styles.currencySelected}>
              <Ionicons name="checkmark-circle" size={18} color="#087E8B" />
              <View><Text style={styles.currencyName}>Leones</Text><Text style={styles.currencyCode}>SLE</Text></View>
            </View>
            <View style={styles.currencyDisabled}>
              <Ionicons name="lock-closed-outline" size={16} color="#98A2B3" />
              <View><Text style={styles.currencyDisabledName}>USD</Text><Text style={styles.currencyCode}>Not enabled</Text></View>
            </View>
          </View>

          <View style={styles.preview}>
            <Ionicons name="information-circle-outline" size={18} color="#087E8B" />
            <Text style={styles.previewText}>
              {commissionType === 'percentage'
                ? `For every Le 1,000,000 paid booking, the current ${commissionValue || '0'}% setting gives the platform Le ${Math.round((Number(commissionValue) || 0) * 10000).toLocaleString()} and the vendor the remainder.`
                : `The fixed platform charge is Le ${(Number(commissionValue) || 0).toLocaleString()} per paid booking.`}
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={() => void save()}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="save-outline" size={18} color="#FFFFFF" />}
            <Text style={styles.saveButtonText}>{saving ? 'Saving settings…' : 'Save settings'}</Text>
          </TouchableOpacity>
          {settings?.updated_at ? <Text style={styles.updated}>Last updated {new Date(settings.updated_at).toLocaleString()}</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1050, alignSelf: 'center', padding: 24, paddingBottom: 48, gap: 20 },
  pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  eyebrow: { color: '#087E8B', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  heading: { marginTop: 4, color: '#17354B', fontSize: 28, fontWeight: '800' },
  subtitle: { marginTop: 5, color: '#718397', fontSize: 13 },
  headingIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E8F5F3' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  sectionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#E8F5F3' },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: '#17354B', fontSize: 17, fontWeight: '800' },
  sectionSubtitle: { marginTop: 3, color: '#718397', fontSize: 12 },
  form: { maxWidth: 720, gap: 10, padding: 20, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#FFFFFF' },
  label: { marginTop: 6, color: '#344054', fontSize: 12, fontWeight: '700' },
  segmentedControl: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 8, backgroundColor: '#F3F6F7' },
  segment: { minHeight: 40, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  segmentSelected: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B9DCDD' },
  segmentText: { color: '#667085', fontSize: 13, fontWeight: '600' },
  segmentTextSelected: { color: '#087E8B', fontWeight: '800' },
  valueField: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 7 },
  valueInput: { minWidth: 0, flex: 1, paddingHorizontal: 13, paddingVertical: 10, color: '#17354B', fontSize: 17, fontWeight: '700' },
  valueSuffix: { minWidth: 44, paddingHorizontal: 12, color: '#526974', textAlign: 'center', fontSize: 15, fontWeight: '700' },
  hint: { marginTop: -4, color: '#718397', fontSize: 11, lineHeight: 16 },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  currencySelected: { minWidth: 155, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: '#99CFCF', borderRadius: 7, backgroundColor: '#F2FAFA' },
  currencyDisabled: { minWidth: 155, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 7, backgroundColor: '#F8FAFC' },
  currencyName: { color: '#17354B', fontSize: 13, fontWeight: '700' },
  currencyDisabledName: { color: '#98A2B3', fontSize: 13, fontWeight: '700' },
  currencyCode: { marginTop: 2, color: '#718397', fontSize: 10 },
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 6, padding: 12, borderRadius: 7, backgroundColor: '#F1F8F8' },
  previewText: { flex: 1, color: '#526974', fontSize: 12, lineHeight: 18 },
  saveButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, borderRadius: 7, backgroundColor: '#087E8B' },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  updated: { color: '#82909B', fontSize: 10 },
  loading: { paddingVertical: 20 },
  error: { padding: 12, color: '#B42318', fontSize: 12, borderRadius: 7, backgroundColor: '#FEF3F2' },
  success: { padding: 12, color: '#027A48', fontSize: 12, borderRadius: 7, backgroundColor: '#ECFDF3' },
});