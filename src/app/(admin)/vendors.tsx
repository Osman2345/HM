import { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { loadAdminVendors, updateAdminUser, type AdminUser } from '@/services/admin';
import { supabase } from '@/lib/supabase';

export default function AdminVendorsScreen() {
  const [vendors, setVendors] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const vendorRows = await loadAdminVendors();
      setVendors(
        vendorRows.sort((first, second) => {
          const firstPending = first.vendor_status.toLowerCase() === 'pending' ? 0 : 1;
          const secondPending = second.vendor_status.toLowerCase() === 'pending' ? 0 : 1;
          return firstPending - secondPending || second.created_at.localeCompare(first.created_at);
        }),
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load vendor accounts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeout);
  }, [refresh]);

  const updateVendor = async (vendor: AdminUser, values: { vendorStatus?: string; disabled?: boolean }) => {
    setBusyId(vendor.id);
    setError(null);
    try {
      await updateAdminUser(vendor.id, values);
      await refresh(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update this vendor.');
    } finally {
      setBusyId(null);
    }
  };

  const openDocument = async (vendor: AdminUser) => {
    if (!vendor.business_document_url) {
      return;
    }

    setDocumentBusyId(vendor.id);
    setError(null);
    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from('vendor-documents')
        .createSignedUrl(vendor.business_document_url, 300);
      if (signedUrlError) {
        throw signedUrlError;
      }
      await Linking.openURL(data.signedUrl);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to open the verification document.');
    } finally {
      setDocumentBusyId(null);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <Text style={styles.heading}>Vendor management</Text>
      <Text style={styles.meta}>
        New vendor accounts need administrator approval. Approved vendors can publish their properties immediately.
      </Text>
      {loading ? <Text style={styles.state}>Loading vendors…</Text> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => void refresh()}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && vendors.length === 0 ? <Text style={styles.state}>No vendor accounts found.</Text> : null}
      {vendors.map((vendor) => (
        <View key={vendor.id} style={styles.card}>
          <Text style={styles.name}>{vendor.business_name || vendor.fullname || vendor.email}</Text>
          <Text style={styles.meta}>{vendor.fullname ?? 'Name not provided'} · {vendor.email}</Text>
          <Text style={styles.meta}>Vendor status: {vendor.vendor_status} · Account: {vendor.disabled ? 'disabled' : 'enabled'}</Text>
          {vendor.vendor_status.toLowerCase() !== 'approved' ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Approve vendor ${vendor.business_name || vendor.fullname || vendor.email}`}
              disabled={busyId === vendor.id}
              style={[styles.accept, busyId === vendor.id && styles.actionDisabled]}
              onPress={() => void updateVendor(vendor, { vendorStatus: 'approved', disabled: false })}
            >
              <Text style={styles.buttonText}>{busyId === vendor.id ? 'Approving…' : 'Approve vendor'}</Text>
            </TouchableOpacity>
          ) : (
            <View accessibilityLabel="Vendor already approved" style={styles.accepted}>
              <Text style={styles.acceptedText}>Vendor approved</Text>
            </View>
          )}
          {vendor.business_description ? <Text style={styles.description}>{vendor.business_description}</Text> : null}
          <Text style={styles.meta}>
            Verification document: {vendor.business_document_url ? 'submitted' : 'not provided'}
          </Text>
          {vendor.vendor_terms_accepted_at ? (
            <Text style={styles.meta}>
              Vendor rules accepted {new Date(vendor.vendor_terms_accepted_at).toLocaleDateString()}
            </Text>
          ) : null}
          {vendor.business_document_url ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={documentBusyId === vendor.id}
              style={styles.secondary}
              onPress={() => void openDocument(vendor)}
            >
              <Text style={styles.secondaryText}>
                {documentBusyId === vendor.id ? 'Opening document…' : 'View business licence'}
              </Text>
            </TouchableOpacity>
          ) : null}
          {vendor.vendor_status !== 'rejected' ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busyId === vendor.id}
              style={styles.reject}
              onPress={() => void updateVendor(vendor, { vendorStatus: 'rejected' })}
            >
              <Text style={styles.buttonText}>Reject vendor</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busyId === vendor.id}
            style={styles.secondary}
            onPress={() => void updateVendor(vendor, { disabled: !vendor.disabled })}
          >
            <Text style={styles.secondaryText}>{vendor.disabled ? 'Enable account' : 'Suspend account'}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C' },
  card: { padding: 14, gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12 },
  name: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  meta: { color: '#475569' },
  description: { color: '#334155' },
  accept: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#15803D' },
  actionDisabled: { opacity: 0.6 },
  accepted: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#DCFCE7' },
  acceptedText: { color: '#166534', fontWeight: '700' },
  primary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#15803D' },
  reject: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#B91C1C' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#1D4ED8' },
  secondaryText: { color: '#1D4ED8', fontWeight: '700' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
