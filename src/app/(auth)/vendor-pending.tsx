import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { uploadVendorDocument, type VendorDocumentAsset } from '@/lib/vendor-documents';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';

export default function VendorPendingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uploadError?: string | string[] }>();
  const session = useAuthStore((state) => state.session);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const userId = session?.user.id;
  const [document, setDocument] = useState<VendorDocumentAsset | null>(null);
  const [hasDocument, setHasDocument] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [vendorStatus, setVendorStatus] = useState<string | null>(null);
  const [message, setMessage] = useState(
    typeof params.uploadError === 'string' ? params.uploadError : null,
  );

  const checkApprovalStatus = useCallback(async () => {
    if (!userId) return;

    setCheckingStatus(true);
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
    } finally {
      setCheckingStatus(false);
    }
  }, [refreshProfile, router, userId]);

  const loadDocumentStatus = useCallback(async () => {
    if (!userId) {
      return;
    }
    const { data, error } = await supabase
      .from('users')
      .select('business_document_url')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      setMessage(error.message);
      return;
    }
    setHasDocument(Boolean(data?.business_document_url));
  }, [userId]);

  const selectDocument = async () => {
    setMessage(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('Allow photo-library access to select your business licence.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        setDocument(asset ? {
          uri: asset.uri,
          name: asset.fileName ?? 'Business licence photo',
          mimeType: asset.mimeType ?? null,
          size: asset.fileSize,
        } : null);
      }
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : 'Unable to open your photos.');
    }
  };

  const selectPdf = async () => {
    setMessage(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        setDocument({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/pdf',
          size: asset.size,
        });
      }
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : 'Unable to open your documents.');
    }
  };

  const uploadDocument = async () => {
    if (!session?.user.id) {
      setMessage('Please sign in again to upload your business licence.');
      return;
    }
    if (!document) {
      setMessage('Choose a photo or PDF of your business licence first.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await uploadVendorDocument(session.user.id, document);
      setHasDocument(true);
      setDocument(null);
      setMessage('Your business licence was uploaded securely. Your application is ready for review.');
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : 'Unable to upload the business licence.');
    } finally {
      setBusy(false);
    }
  };

  useFocusEffect(useCallback(() => {
    void checkApprovalStatus();
    void loadDocumentStatus();
    const interval = setInterval(() => void checkApprovalStatus(), 20000);
    return () => clearInterval(interval);
  }, [checkApprovalStatus, loadDocumentStatus]));

  const applicationRejected = vendorStatus === 'rejected';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={hasDocument ? 'checkmark-circle-outline' : 'time-outline'} size={34} color="#087E8B" />
      </View>
      <Text style={styles.eyebrow}>SL STAY PARTNERS</Text>
      <Text style={styles.title}>
        {applicationRejected
          ? 'Vendor application not approved'
          : hasDocument ? 'Application under review' : 'Finish your vendor application'}
      </Text>
      <Text style={styles.subtitle}>
        {applicationRejected
          ? 'Your vendor application was not approved. Contact the administrator for more information.'
          : hasDocument
            ? 'Your application is awaiting administrator approval. Once approved, you can publish properties immediately without separate property approval.'
            : 'Your vendor account is created, but we still need a business licence photo or PDF before we can review it.'}
      </Text>

      {!hasDocument && !applicationRejected ? (
        <View style={styles.uploadSection}>
          <TouchableOpacity style={styles.uploadCard} onPress={() => void selectDocument()}>
            {document ? (
              document.mimeType?.startsWith('image/') ? (
                <Image source={{ uri: document.uri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={styles.uploadIcon}><Ionicons name="document-text-outline" size={22} color="#087E8B" /></View>
              )
            ) : (
              <View style={styles.uploadIcon}><Ionicons name="cloud-upload-outline" size={24} color="#087E8B" /></View>
            )}
            <View style={styles.uploadCopy}>
              <Text style={styles.uploadTitle}>{document?.name || 'Choose business licence photo'}</Text>
              <Text style={styles.uploadHint}>Photo or PDF · up to 10 MB</Text>
            </View>
            <Ionicons name="add-circle-outline" size={22} color="#087E8B" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.pdfButton} onPress={() => void selectPdf()}>
            <Ionicons name="document-attach-outline" size={16} color="#087E8B" />
            <Text style={styles.pdfButtonText}>Choose a PDF instead</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => void uploadDocument()} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Uploading securely…' : 'Upload and submit for review'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.checkButton}
        disabled={checkingStatus}
        onPress={() => void checkApprovalStatus()}
      >
        <Text style={styles.checkButtonText}>
          {checkingStatus ? 'Checking application…' : 'Check approval status'}
        </Text>
      </TouchableOpacity>
      <View style={styles.privacyNote}>
        <Ionicons name="lock-closed-outline" size={16} color="#087E8B" />
        <Text style={styles.privacyText}>Your verification image is private and only available to authorised reviewers.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#F5F7F8',
  },
  iconCircle: {
    width: 64,
    height: 64,
    marginBottom: 19,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7F2F2',
  },
  eyebrow: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    marginTop: 8,
    color: '#17354B',
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    color: '#667783',
    fontSize: 14,
    lineHeight: 21,
  },
  uploadSection: {
    marginTop: 20,
    gap: 11,
  },
  uploadCard: {
    minHeight: 80,
    padding: 11,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B8D1D4',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  uploadIcon: {
    width: 43,
    height: 43,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF4F4',
  },
  preview: {
    width: 55,
    height: 57,
    borderRadius: 9,
  },
  uploadCopy: {
    flex: 1,
  },
  uploadTitle: {
    color: '#294556',
    fontSize: 12,
    fontWeight: '700',
  },
  uploadHint: {
    marginTop: 4,
    color: '#81919B',
    fontSize: 10,
  },
  pdfButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pdfButtonText: {
    color: '#087E8B',
    fontSize: 11,
    fontWeight: '700',
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  checkButton: {
    minHeight: 44,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#087E8B',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  checkButtonText: {
    color: '#087E8B',
    fontSize: 13,
    fontWeight: '800',
  },
  message: {
    marginTop: 14,
    color: '#285464',
    fontSize: 12,
    lineHeight: 18,
  },
  privacyNote: {
    marginTop: 20,
    padding: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#EAF4F4',
  },
  privacyText: {
    flex: 1,
    color: '#536D78',
    fontSize: 11,
    lineHeight: 16,
  },
});
