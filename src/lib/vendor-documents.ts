import { supabase } from '@/lib/supabase';

export const vendorDocumentTypes = ['national_id', 'hotel_document', 'business_document'] as const;
export type VendorDocumentType = (typeof vendorDocumentTypes)[number];

const maxDocumentSize = 5 * 1024 * 1024;
export interface VendorDocumentAsset {
  uri: string;
  name: string;
  mimeType: string | null;
  size?: number;
}

export interface VendorDocumentRecord {
  id: string;
  vendor_id: string;
  document_type: VendorDocumentType;
  file_url: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const mimeTypeFor = (asset: VendorDocumentAsset) => {
  if (asset.mimeType) {
    return asset.mimeType.toLowerCase();
  }
  const extension = asset.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return '';
};

const extensionFor = (asset: VendorDocumentAsset, mimeType: string) => {
  const fromName = asset.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName && ['pdf', 'jpg', 'jpeg', 'png'].includes(fromName)) {
    return fromName;
  }
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/jpeg') return 'jpg';
  return mimeType.split('/')[1];
};

const labelForType = (documentType: VendorDocumentType) => {
  const labels: Record<VendorDocumentType, string> = {
    national_id: 'National ID / Passport',
    hotel_document: 'Hotel document',
    business_document: 'Business document',
  };
  return labels[documentType];
};

export const getVendorDocumentTypeLabel = (documentType: VendorDocumentType) => labelForType(documentType);

export const uploadVendorDocument = async (
  userId: string,
  documentType: VendorDocumentType,
  asset: VendorDocumentAsset,
): Promise<VendorDocumentRecord> => {
  const mimeType = mimeTypeFor(asset);
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error(`Choose a PDF or a JPG/PNG image for ${labelForType(documentType)}.`);
  }
  if (asset.size !== undefined && asset.size > maxDocumentSize) {
    throw new Error(`${labelForType(documentType)} must be 5 MB or smaller.`);
  }

  const fileResponse = await fetch(asset.uri);
  if (!fileResponse.ok) {
    throw new Error(`Could not read the selected ${labelForType(documentType)}.`);
  }
  const fileBlob = await fileResponse.blob();
  if (fileBlob.size > maxDocumentSize) {
    throw new Error(`${labelForType(documentType)} must be 5 MB or smaller.`);
  }

  const extension = extensionFor(asset, mimeType);
  const filePath = `${userId}/${documentType}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('vendor-documents')
    .upload(filePath, fileBlob, { contentType: mimeType, upsert: false });

  if (uploadError) {
    throw uploadError;
  }

  const { data, error } = await supabase.rpc('save_vendor_document', {
    p_document_type: documentType,
    p_file_url: filePath,
  });

  if (error) {
    const { error: cleanupError } = await supabase.storage.from('vendor-documents').remove([filePath]);
    if (cleanupError) {
      throw new Error(`${error.message} The uploaded file could not be cleaned up: ${cleanupError.message}`);
    }
    throw error;
  }

  return data as VendorDocumentRecord;
};

export const listVendorDocuments = async (userId: string): Promise<VendorDocumentRecord[]> => {
  const { data, error } = await supabase
    .from('vendor_documents')
    .select('*')
    .eq('vendor_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VendorDocumentRecord[];
};

export const getSignedVendorDocumentUrl = async (fileUrl: string) => {
  const { data, error } = await supabase.storage.from('vendor-documents').createSignedUrl(fileUrl, 300);
  if (error) {
    throw new Error(error.message);
  }
  return data.signedUrl;
};
