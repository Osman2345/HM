import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { sendVendorDecisionEmail } from '@/lib/backend';
import { getSignedVendorDocumentUrl } from '@/lib/vendor-documents';
import { loadAdminVendors, updateAdminUser, type AdminUser } from '@/services/admin';

const documentLabelMap = {
  national_id: 'National ID / Passport',
  hotel_document: 'Hotel document',
  business_document: 'Business document',
} as const;

export default function AdminVendorsScreen() {
  const [vendors, setVendors] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    try {
      await updateAdminUser(vendor.id, values);
      let emailError: string | null = null;
      if (values.vendorStatus === 'approved' || values.vendorStatus === 'rejected') {
        try {
          await sendVendorDecisionEmail(vendor.id, values.vendorStatus);
        } catch (caughtError) {
          emailError = caughtError instanceof Error ? caughtError.message : 'Unable to send the decision email.';
        }
      }
      await refresh(true);
      if (emailError) {
        setError(`Vendor status was updated, but the email was not sent. ${emailError}`);
      } else if (values.vendorStatus) {
        setNotice(`Vendor ${values.vendorStatus} and notification email sent.`);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update this vendor.');
    } finally {
      setBusyId(null);
    }
  };

  const resendDecisionEmail = async (vendor: AdminUser) => {
    if (vendor.vendor_status !== 'approved' && vendor.vendor_status !== 'rejected') return;
    setBusyId(vendor.id);
    setError(null);
    setNotice(null);
    try {
      await sendVendorDecisionEmail(vendor.id, vendor.vendor_status);
      setNotice(`Decision email sent to ${vendor.email}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to send the decision email.');
    } finally {
      setBusyId(null);
    }
  };

  const openDocument = async (vendor: AdminUser, documentType: keyof typeof documentLabelMap) => {
    const documentRow = (vendor.vendor_documents ?? []).find((doc) => doc.document_type === documentType);
    if (!documentRow) {
      setError(`${documentLabelMap[documentType]} has not been uploaded yet.`);
      return;
    }

    setDocumentBusyId(vendor.id);
    setError(null);
    try {
      const signedUrl = await getSignedVendorDocumentUrl(documentRow.file_url);
      await Linking.openURL(signedUrl);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to open the verification document.');
    } finally {
      setDocumentBusyId(null);
    }
  };

  const documentRows = useMemo(
    () => Object.entries(documentLabelMap) as [keyof typeof documentLabelMap, string][],
    [],
  );

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
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {!loading && !error && vendors.length === 0 ? <Text style={styles.state}>No vendor accounts found.</Text> : null}
      {vendors.map((vendor) => (
        <View key={vendor.id} style={styles.card}>
          <Text style={styles.name}>{vendor.business_name || vendor.fullname || vendor.email}</Text>
          <Text style={styles.meta}>{vendor.fullname ?? 'Name not provided'} · {vendor.email}</Text>
          <Text style={styles.meta}>Plan: {vendor.plan_id.toUpperCase()} · Selected at signup: {vendor.pending_plan_id.toUpperCase()}</Text>
          <Text style={styles.meta}>Vendor status: {vendor.vendor_status} · Account: {vendor.disabled ? 'disabled' : 'enabled'}</Text>
          {(() => {
            const documentsReady = (vendor.vendor_documents ?? []).length === 3;
            return vendor.vendor_status.toLowerCase() !== 'approved' ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Approve vendor ${vendor.business_name || vendor.fullname || vendor.email}`}
                disabled={busyId === vendor.id || !documentsReady}
                style={[styles.accept, (busyId === vendor.id || !documentsReady) && styles.actionDisabled]}
                onPress={() => void updateVendor(vendor, { vendorStatus: 'approved', disabled: false })}
              >
                <Text style={styles.buttonText}>
                  {busyId === vendor.id ? 'Approving…' : documentsReady ? 'Approve vendor' : 'Upload all 3 documents to approve'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View accessibilityLabel="Vendor already approved" style={styles.accepted}>
                <Text style={styles.acceptedText}>Vendor approved</Text>
              </View>
            );
          })()}
          {vendor.business_description ? <Text style={styles.description}>{vendor.business_description}</Text> : null}

          <View style={styles.documentList}>
            {documentRows.map(([documentType, label]) => {
              const row = (vendor.vendor_documents ?? []).find((doc) => doc.document_type === documentType);
              return (
                <View key={documentType} style={styles.documentRow}>
                  <Text style={styles.documentLabel}>{label}</Text>
                  {row ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={documentBusyId === vendor.id}
                      style={styles.secondary}
                      onPress={() => void openDocument(vendor, documentType)}
                    >
                      <Text style={styles.secondaryText}>{documentBusyId === vendor.id ? 'Opening…' : 'View'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.noDocument}>Not uploaded</Text>
                  )}
                </View>
              );
            })}
          </View>

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
          {vendor.vendor_status === 'approved' || vendor.vendor_status === 'rejected' ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busyId === vendor.id}
              style={styles.secondary}
              onPress={() => void resendDecisionEmail(vendor)}
            >
              <Text style={styles.secondaryText}>
                {busyId === vendor.id ? 'Sending…' : 'Resend decision email'}
              </Text>
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
  notice: { color: '#0F766E', fontWeight: '600' },
  card: { padding: 14, gap: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12 },
  name: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  meta: { color: '#475569' },
  description: { color: '#334155' },
  accept: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#15803D' },
  actionDisabled: { opacity: 0.6 },
  accepted: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#DCFCE7' },
  acceptedText: { color: '#166534', fontWeight: '700' },
  primary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#15803D' },
  reject: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#B91C1C' },
  secondary: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  secondaryText: { color: '#0F172A', fontWeight: '700', fontSize: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  documentList: { gap: 8 },
  documentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  documentLabel: { color: '#334155', fontSize: 12, fontWeight: '700', flex: 1 },
  noDocument: { color: '#94A3B8', fontSize: 12 },
});
