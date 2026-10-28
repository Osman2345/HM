import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  getSignedVendorDocumentUrl,
  listVendorDocuments,
  uploadVendorDocument,
  vendorDocumentTypes,
  type VendorDocumentAsset,
  type VendorDocumentType,
} from '@/lib/vendor-documents';
import { useAuthStore } from '@/store/auth.store';

const requiredDocumentTypes = vendorDocumentTypes.map((documentType) => ({
  type: documentType,
  label: {
    national_id: 'National ID / Passport',
    hotel_document: 'Hotel document',
    business_document: 'Business registration document',
  }[documentType],
  hint: {
    national_id: 'Government-issued ID',
    hotel_document: 'Property registration or permit',
    business_document: 'Business registration / licence',
  }[documentType],
}));

export default function VendorPendingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uploadError?: string | string[] }>();
  const session = useAuthStore((state) => state.session);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const userId = session?.user.id;
  const [documents, setDocuments] = useState<Record<VendorDocumentType, VendorDocumentAsset | null>>({
    national_id: null,
    hotel_document: null,
    business_document: null,
  });
  const [submitted, setSubmitted] = useState<Record<VendorDocumentType, boolean>>({
    national_id: false,
    hotel_document: false,
    business_document: false,
  });
  const [busy, setBusy] = useState(false);
  const [documentsConfirmed, setDocumentsConfirmed] = useState(false);
  const [vendorStatus, setVendorStatus] = useState<string | null>(null);
  const [message, setMessage] = useState(
    typeof params.uploadError === 'string' ? params.uploadError : null,
  );

  const checkApprovalStatus = useCallback(async () => {
    if (!userId) return;

    try {
      const profile = await refreshProfile();
      setVendorStatus(profile.vendor_status);
      if (profile.disabled) {
        router.replace('/(auth)/account-disabled');
      } else if (profile.role === 'vendor' && profile.vendor_status === 'approved') {
        router.replace('/(vendor)/dashboard');
      }
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : 'Unable to check your application status.');
    }
  }, [refreshProfile, router, userId]);

  const loadDocumentStatus = useCallback(async () => {
    if (!userId) return;

    try {
      const rows = await listVendorDocuments(userId);
      const nextSubmitted: Record<VendorDocumentType, boolean> = {
        national_id: false,
        hotel_document: false,
        business_document: false,
      };
      rows.forEach((row) => {
        if (row.document_type in nextSubmitted) {
          nextSubmitted[row.document_type] = true;
        }
      });
      setSubmitted(nextSubmitted);
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : 'Unable to load your uploaded documents.');
    }
  }, [userId]);

  const allDocumentsSubmitted = useMemo(
    () => requiredDocumentTypes.every((doc) => submitted[doc.type]),
    [submitted],
  );

  const selectDocument = async (documentType: VendorDocumentType) => {
    setMessage(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setDocuments((current) => ({
          ...current,
          [documentType]: {
            uri: asset.uri,
            name: asset.name || `${documentType}.pdf`,
            mimeType: asset.mimeType ?? null,
            size: asset.size,
          },
        }));
      }
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : 'Unable to choose a document.');
    }
  };

  const uploadDocuments = async () => {
    if (!userId) {
      setMessage('Please sign in again to submit your documents.');
      return;
    }

    const missing = requiredDocumentTypes.filter((doc) => !documents[doc.type]);
    if (missing.length > 0) {
      setMessage(`Please select ${missing[0].label} before submitting.`);
      return;
    }
    if (!documentsConfirmed) {
      setMessage('Confirm that the documents are genuine before submitting.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      for (const doc of requiredDocumentTypes) {
        const asset = documents[doc.type];
        if (!asset) {
          throw new Error(`Missing ${doc.label}.`);
        }
        await uploadVendorDocument(userId, doc.type, asset);
      }
      setSubmitted({
        national_id: true,
        hotel_document: true,
        business_document: true,
      });
      setMessage(null);
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : 'Unable to upload your documents.');
    } finally {
      setBusy(false);
    }
  };

  const previewDocument = async (documentType: VendorDocumentType) => {
    if (!userId) return;
    try {
      const rows = await listVendorDocuments(userId);
      const row = rows.find((item) => item.document_type === documentType);
      if (!row) {
        setMessage('No document has been uploaded for this type yet.');
        return;
      }
      const signedUrl = await getSignedVendorDocumentUrl(row.file_url);
      await import('expo-linking').then(({ openURL }) => openURL(signedUrl));
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : 'Unable to open this document.');
    }
  };

  useFocusEffect(useCallback(() => {
    void checkApprovalStatus();
    void loadDocumentStatus();
    const interval = setInterval(() => void checkApprovalStatus(), 20000);
    return () => clearInterval(interval);
  }, [checkApprovalStatus, loadDocumentStatus]));

  const applicationRejected = vendorStatus === 'rejected';
  const showSubmissionConfirmation = allDocumentsSubmitted && !applicationRejected;

  if (showSubmissionConfirmation) {
    return (
      <ScrollView contentContainerStyle={styles.confirmationContainer}>
        <View style={styles.confirmationIcon}>
          <Text style={styles.confirmationIconText}>✓</Text>
        </View>
        <Text style={styles.eyebrow}>APPLICATION SUBMITTED</Text>
        <Text style={styles.confirmationTitle}>You’re all set</Text>
        <Text style={styles.confirmationSubtitle}>
          Your three documents have been received and your vendor account is pending admin review.
        </Text>
        <View style={styles.confirmationCard}>
          <Text style={styles.confirmationCardTitle}>What happens next?</Text>
          <Text style={styles.confirmationCardText}>
            We’ll notify you by email at {session?.user.email ?? 'your registered email'} when the admin accepts or declines your application.
          </Text>
          <View style={styles.pendingBadge}>
            <View style={styles.pendingDot} />
            <Text style={styles.pendingBadgeText}>Pending admin review</Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.homeButton}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </TouchableOpacity>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>{allDocumentsSubmitted ? '✓' : '3'}</Text>
      </View>
      <Text style={styles.eyebrow}>VENDOR REVIEW</Text>
      <Text style={styles.title}>
        {applicationRejected ? 'Application not approved' : allDocumentsSubmitted ? 'Documents submitted' : 'Upload required documents'}
      </Text>
      <Text style={styles.subtitle}>
        {applicationRejected
          ? 'Your vendor application was declined. Please sign up again with valid documents.'
            : 'Upload the required identification and business documents before your account can be approved.'}
      </Text>

      {!applicationRejected ? (
        <View style={styles.uploadSection}>
          {requiredDocumentTypes.map((doc) => {
            const selected = documents[doc.type];
            const alreadySubmitted = submitted[doc.type];
            return (
              <View key={doc.type} style={styles.docCard}>
                <View style={styles.docHeader}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  {alreadySubmitted ? <Text style={styles.badge}>Submitted</Text> : null}
                </View>
                <Text style={styles.docHint}>{doc.hint}</Text>
                <Text style={styles.docHint}>PDF, JPG, or PNG · Maximum 5 MB</Text>
                <TouchableOpacity style={styles.selectButton} onPress={() => void selectDocument(doc.type)}>
                  <Text style={styles.selectButtonText}>{selected ? selected.name : `Choose ${doc.label}`}</Text>
                </TouchableOpacity>
                {selected ? <Text style={styles.fileName}>{selected.name}</Text> : null}
                {alreadySubmitted ? (
                  <TouchableOpacity style={styles.previewButton} onPress={() => void previewDocument(doc.type)}>
                    <Text style={styles.previewText}>View uploaded file</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.confirmRow}
            onPress={() => setDocumentsConfirmed((confirmed) => !confirmed)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: documentsConfirmed }}
          >
            <View style={[styles.checkbox, documentsConfirmed && styles.checkboxChecked]}>
              {documentsConfirmed ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.confirmText}>I confirm these documents are genuine and belong to my business.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryButton} onPress={() => void uploadDocuments()} disabled={busy}>
            <Text style={styles.primaryButtonText}>{busy ? 'Submitting…' : 'Submit for review'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {applicationRejected ? (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.homeButton}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.checkButton}
          onPress={() => void checkApprovalStatus()}
        >
          <Text style={styles.checkButtonText}>Check approval status</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#F5F7F8',
    gap: 14,
  },
  confirmationContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F5F7F8',
    gap: 16,
  },
  confirmationIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: '#DFF7F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationIconText: {
    color: '#0F766E',
    fontSize: 32,
    fontWeight: '800',
  },
  confirmationTitle: {
    color: '#17354B',
    fontSize: 32,
    fontWeight: '800',
  },
  confirmationSubtitle: {
    color: '#53657A',
    fontSize: 15,
    lineHeight: 23,
  },
  confirmationCard: {
    marginTop: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D9E1E8',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  confirmationCardTitle: {
    color: '#17354B',
    fontSize: 16,
    fontWeight: '800',
  },
  confirmationCardText: {
    color: '#53657A',
    fontSize: 14,
    lineHeight: 21,
  },
  pendingBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    backgroundColor: '#FFF7E6',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  pendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#D97706',
  },
  pendingBadgeText: {
    color: '#9A5B00',
    fontSize: 12,
    fontWeight: '700',
  },
  homeButton: {
    marginTop: 6,
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
  },
  homeButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#E8F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#087E8B',
    fontSize: 22,
    fontWeight: '800',
  },
  eyebrow: {
    color: '#087E8B',
    fontSize: 12,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: {
    color: '#17354B',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#53657A',
    fontSize: 14,
    lineHeight: 21,
  },
  uploadSection: {
    marginTop: 8,
    gap: 14,
  },
  docCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E1E8',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  docLabel: {
    color: '#17354B',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#0F766E',
    backgroundColor: '#DFF7F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  docHint: {
    color: '#718397',
    fontSize: 12,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
  },
  checkbox: {
    width: 21,
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    borderColor: '#087E8B',
    backgroundColor: '#087E8B',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  confirmText: {
    flex: 1,
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
  },
  selectButton: {
    backgroundColor: '#EEF7FB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  selectButtonText: {
    color: '#17354B',
    fontWeight: '700',
  },
  fileName: {
    color: '#475569',
    fontSize: 12,
    marginTop: -4,
  },
  previewButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  previewText: {
    color: '#0F766E',
    fontWeight: '700',
    fontSize: 12,
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: '#087E8B',
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  checkButton: {
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF4FC',
  },
  checkButtonText: {
    color: '#17354B',
    fontWeight: '700',
  },
  message: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
});
