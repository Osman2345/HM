import { supabase } from '@/lib/supabase';

const maxDocumentSize = 10 * 1024 * 1024;
export interface VendorDocumentAsset {
  uri: string;
  name: string;
  mimeType: string | null;
  size?: number;
}

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const mimeTypeFor = (asset: VendorDocumentAsset) => {
  if (asset.mimeType) {
    return asset.mimeType.toLowerCase();
  }
  const extension = asset.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return '';
};

const extensionFor = (asset: VendorDocumentAsset, mimeType: string) => {
  const fromName = asset.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName && ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(fromName)) {
    return fromName;
  }
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/jpeg') return 'jpg';
  return mimeType.split('/')[1];
};

export const uploadVendorDocument = async (userId: string, asset: VendorDocumentAsset) => {
  const mimeType = mimeTypeFor(asset);
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error('Choose a PDF or a JPEG, PNG, WebP, or HEIC photo of your business licence.');
  }
  if (asset.size !== undefined && asset.size > maxDocumentSize) {
    throw new Error('The business licence file must be 10 MB or smaller.');
  }

  const fileResponse = await fetch(asset.uri);
  if (!fileResponse.ok) {
    throw new Error('Could not read the selected business licence file.');
  }
  const image = await fileResponse.blob();
  if (image.size > maxDocumentSize) {
    throw new Error('The business licence file must be 10 MB or smaller.');
  }

  const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensionFor(asset, mimeType)}`;
  const { error: uploadError } = await supabase.storage
    .from('vendor-documents')
    .upload(filePath, image, { contentType: mimeType, upsert: false });

  if (uploadError) {
    throw uploadError;
  }

  const { error: profileError } = await supabase
    .from('users')
    .update({ business_document_url: filePath })
    .eq('id', userId);

  if (profileError) {
    throw profileError;
  }

  return filePath;
};
