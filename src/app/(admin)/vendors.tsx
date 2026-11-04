import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { sendVendorDecisionEmail } from '@/lib/backend';
import { getSignedVendorDocumentUrl } from '@/lib/vendor-documents';
import { loadAdminVendors, updateAdminUser, type AdminUser } from '@/services/admin';
import { AdminTable, AdminTableCell, AdminTableHeader, AdminTableRow, adminTableText } from '@/components/admin/AdminTable';

const documentLabelMap = {
  national_id: 'National ID / Passport',
  hotel_document: 'Hotel document',
  business_document: 'Business document',
} as const;
const vendorFilters = ['all', 'pending', 'approved', 'rejected'] as const;

export default function AdminVendorsScreen() {
  const [vendors, setVendors] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof vendorFilters)[number]>('pending');
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

  const visibleVendors = vendors.filter((vendor) => {
    const matchesStatus = statusFilter === 'all' || vendor.vendor_status.toLowerCase() === statusFilter;
    const searchTerm = search.trim().toLowerCase();
    const matchesSearch = !searchTerm || [vendor.business_name, vendor.fullname, vendor.email]
      .some((value) => value?.toLowerCase().includes(searchTerm));
    return matchesStatus && matchesSearch;
  });

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <View style={styles.pageHeading}>
        <View><Text style={styles.heading}>Vendor management</Text><Text style={styles.subtitle}>{visibleVendors.length} matching vendors</Text></View>
      </View>
      <View style={styles.toolbar}>
        <TextInput
          accessibilityLabel="Search vendors"
          value={search}
          onChangeText={setSearch}
          placeholder="Search business, contact or email"
          autoCapitalize="none"
          style={styles.search}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {vendorFilters.map((status) => (
            <TouchableOpacity
              key={status}
              accessibilityRole="button"
              accessibilityState={{ selected: statusFilter === status }}
              style={[styles.filterButton, statusFilter === status && styles.filterButtonSelected]}
              onPress={() => setStatusFilter(status)}
            >
              <Text style={[styles.filterText, statusFilter === status && styles.filterTextSelected]}>{status === 'all' ? 'All statuses' : status}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
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
      {!loading && !error && visibleVendors.length === 0 ? <Text style={styles.state}>No vendors match these filters.</Text> : null}
      {!loading && !error && visibleVendors.length ? (
        <AdminTable minWidth={1180}>
          <AdminTableHeader>
            <AdminTableCell width={235}><Text style={adminTableText.header}>Vendor</Text></AdminTableCell>
            <AdminTableCell width={120}><Text style={adminTableText.header}>Status</Text></AdminTableCell>
            <AdminTableCell width={190}><Text style={adminTableText.header}>Documents</Text></AdminTableCell>
            <AdminTableCell width={215}><Text style={adminTableText.header}>Payment policy</Text></AdminTableCell>
            <AdminTableCell width={390}><Text style={adminTableText.header}>Manage</Text></AdminTableCell>
          </AdminTableHeader>
          {visibleVendors.map((vendor) => {
            const documentsReady = documentRows.every(([documentType]) => vendor.vendor_documents?.some((document) => document.document_type === documentType));
            return (
              <AdminTableRow key={vendor.id}>
                <AdminTableCell width={235}>
                  <Text numberOfLines={1} style={adminTableText.primary}>{vendor.business_name || vendor.fullname || vendor.email}</Text>
                  <Text numberOfLines={1} style={adminTableText.secondary}>{vendor.fullname || 'Name not provided'} · {vendor.email}</Text>
                </AdminTableCell>
                <AdminTableCell width={120}>
                  <Text style={[styles.statusBadge, vendor.disabled ? styles.statusDisabled : vendor.vendor_status === 'approved' ? styles.statusApproved : styles.statusPending]}>
                    {vendor.disabled ? 'Suspended' : vendor.vendor_status}
                  </Text>
                </AdminTableCell>
                <AdminTableCell width={190}>
                  <View style={styles.documentActions}>
                    {documentRows.map(([documentType]) => {
                      const uploaded = vendor.vendor_documents?.some((document) => document.document_type === documentType);
                      const shortLabel = documentType === 'national_id' ? 'ID' : documentType === 'hotel_document' ? 'Hotel' : 'Business';
                      return (
                        <TouchableOpacity
                          key={documentType}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${shortLabel} document`}
                          disabled={!uploaded || documentBusyId === vendor.id}
                          style={[styles.documentButton, !uploaded && styles.documentButtonMissing]}
                          onPress={() => void openDocument(vendor, documentType)}
                        >
                          <Text style={[styles.documentButtonText, !uploaded && styles.documentButtonMissingText]}>{documentBusyId === vendor.id ? '…' : shortLabel}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.tableHint}>{documentsReady ? '3 of 3 received' : 'Documents missing'}</Text>
                </AdminTableCell>
                <AdminTableCell width={215}>
                  <Text style={vendor.vendor_payment_policy_agreed ? styles.policyAccepted : styles.policyMissing}>
                    {vendor.vendor_payment_policy_agreed ? 'Accepted' : 'Not accepted'}
                  </Text>
                  <Text numberOfLines={1} style={adminTableText.secondary}>
                    {vendor.vendor_payment_policy_agreed_at ? new Date(vendor.vendor_payment_policy_agreed_at).toLocaleDateString() : 'No acceptance date'}
                  </Text>
                </AdminTableCell>
                <AdminTableCell width={390}>
                  <View style={styles.actionGroup}>
                    {vendor.vendor_status !== 'approved' ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={busyId === vendor.id || !documentsReady || !vendor.vendor_payment_policy_agreed}
                        style={[styles.smallAction, styles.approveAction, (busyId === vendor.id || !documentsReady || !vendor.vendor_payment_policy_agreed) && styles.actionDisabled]}
                        onPress={() => void updateVendor(vendor, { vendorStatus: 'approved', disabled: false })}
                      >
                        <Text style={styles.approveText}>{busyId === vendor.id ? 'Saving…' : 'Approve'}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {vendor.vendor_status !== 'rejected' ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={busyId === vendor.id}
                        style={[styles.smallAction, styles.rejectAction]}
                        onPress={() => void updateVendor(vendor, { vendorStatus: 'rejected' })}
                      ><Text style={styles.rejectText}>Reject</Text></TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={busyId === vendor.id}
                      style={styles.smallAction}
                      onPress={() => void updateVendor(vendor, { disabled: !vendor.disabled })}
                    ><Text style={styles.smallActionText}>{vendor.disabled ? 'Enable' : 'Suspend'}</Text></TouchableOpacity>
                    {vendor.vendor_status === 'approved' || vendor.vendor_status === 'rejected' ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={busyId === vendor.id}
                        style={styles.smallAction}
                        onPress={() => void resendDecisionEmail(vendor)}
                      ><Text style={styles.smallActionText}>Email</Text></TouchableOpacity>
                    ) : null}
                  </View>
                </AdminTableCell>
              </AdminTableRow>
            );
          })}
        </AdminTable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 36, gap: 14 },
  pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 23, fontWeight: '800', color: '#17354B' },
  subtitle: { marginTop: 4, color: '#718397', fontSize: 12 },
  toolbar: { gap: 9 },
  search: { minHeight: 42, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', color: '#17354B' },
  filters: { gap: 7, paddingVertical: 1 },
  filterButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: '#DDE6E9', borderRadius: 6, backgroundColor: '#FFFFFF' },
  filterButtonSelected: { borderColor: '#087E8B', backgroundColor: '#E8F5F3' },
  filterText: { color: '#526974', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  filterTextSelected: { color: '#087E8B', fontWeight: '800' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 7, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C', fontSize: 12 },
  notice: { color: '#027A48', fontSize: 12, fontWeight: '700' },
  primary: { minHeight: 34, marginTop: 8, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#087E8B' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, color: '#526974', backgroundColor: '#F2F4F7', fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  statusApproved: { color: '#027A48', backgroundColor: '#ECFDF3' },
  statusPending: { color: '#B54708', backgroundColor: '#FFFAEB' },
  statusDisabled: { color: '#B42318', backgroundColor: '#FEF3F2' },
  documentActions: { flexDirection: 'row', gap: 4 },
  documentButton: { minWidth: 42, minHeight: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: '#B9DCDD', borderRadius: 4, backgroundColor: '#F2FAFA' },
  documentButtonText: { color: '#087E8B', fontSize: 9, fontWeight: '800' },
  documentButtonMissing: { borderColor: '#E4E7EC', backgroundColor: '#F8FAFC' },
  documentButtonMissingText: { color: '#98A2B3' },
  tableHint: { marginTop: 4, color: '#718397', fontSize: 9 },
  policyAccepted: { color: '#027A48', fontSize: 11, fontWeight: '800' },
  policyMissing: { color: '#B42318', fontSize: 11, fontWeight: '800' },
  actionGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  smallAction: { minHeight: 27, justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: '#B9DCDD', borderRadius: 5, backgroundColor: '#FFFFFF' },
  smallActionText: { color: '#087E8B', fontSize: 10, fontWeight: '700' },
  approveAction: { borderColor: '#A6F4C5', backgroundColor: '#ECFDF3' },
  approveText: { color: '#027A48', fontSize: 10, fontWeight: '800' },
  rejectAction: { borderColor: '#FECACA', backgroundColor: '#FEF3F2' },
  rejectText: { color: '#B42318', fontSize: 10, fontWeight: '800' },
  actionDisabled: { opacity: 0.55 },
});
