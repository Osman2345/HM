import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { invalidateCached } from '@/lib/query-cache';
import { useAuthStore } from '@/store/auth.store';
import type { HotelRoom, HotelRow } from '@/types/database';

interface ListingRoom extends HotelRoom {
  formId: string;
  newImages: ImagePicker.ImagePickerAsset[];
}

const emptyRoom = (): ListingRoom => ({
  formId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  id: '',
  type: '',
  price_per_night: 0,
  capacity_guests: 2,
  total_rooms: 1,
  amenities: [],
  images: [],
  newImages: [],
});

const splitList = (value: string) =>
  [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];

const isValidHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

const imageMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const imageExtension = (asset: ImagePicker.ImagePickerAsset, mimeType: string) => {
  const namedExtension = asset.fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (namedExtension && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(namedExtension)) {
    return namedExtension;
  }
  if (mimeType === 'image/jpeg') return 'jpg';
  return mimeType.split('/')[1];
};

interface UploadedImages {
  urls: string[];
  paths: string[];
}

const uploadListingImages = async (
  userId: string,
  assets: ImagePicker.ImagePickerAsset[],
): Promise<UploadedImages> => {
  const paths: string[] = [];
  const urls: string[] = [];

  try {
    const uploadImage = async (asset: ImagePicker.ImagePickerAsset, index: number) => {
      if (asset.fileSize !== undefined && asset.fileSize > 10 * 1024 * 1024) {
        throw new Error(`${asset.fileName ?? 'A selected image'} is larger than 10 MB.`);
      }

      const response = await fetch(asset.uri);
      if (!response.ok) {
        throw new Error(`Unable to read ${asset.fileName ?? 'a selected image'}.`);
      }
      const file = await response.arrayBuffer();
      if (file.byteLength > 10 * 1024 * 1024) {
        throw new Error(`${asset.fileName ?? 'A selected image'} is larger than 10 MB.`);
      }

      const mimeType = asset.mimeType?.toLowerCase() || 'image/jpeg';
      if (!imageMimeTypes.has(mimeType)) {
        throw new Error('Choose JPEG, PNG, WebP, or HEIC hotel photos.');
      }

      const path = `${userId}/listings/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${imageExtension(asset, mimeType)}`;
      const { error } = await supabase.storage
        .from('hotel-images')
        .upload(path, file, { contentType: mimeType, upsert: false });
      if (error) throw error;

      return { path, url: supabase.storage.from('hotel-images').getPublicUrl(path).data.publicUrl };
    };

    for (let start = 0; start < assets.length; start += 3) {
      const batch = assets.slice(start, start + 3);
      const results = await Promise.allSettled(
        batch.map((asset, offset) => uploadImage(asset, start + offset)),
      );
      const failure = results.find((result) => result.status === 'rejected');
      for (const result of results) {
        if (result.status === 'fulfilled') {
          paths.push(result.value.path);
          urls.push(result.value.url);
        }
      }
      if (failure?.status === 'rejected') {
        throw failure.reason;
      }
    }
  } catch (caughtError) {
    if (paths.length) {
      const { error: cleanupError } = await supabase.storage.from('hotel-images').remove(paths);
      if (cleanupError) {
        const message = caughtError instanceof Error ? caughtError.message : 'The photo upload failed.';
        throw new Error(`${message} Cleanup of partially uploaded photos also failed: ${cleanupError.message}`);
      }
    }
    throw caughtError;
  }

  return { urls, paths };
};

const cleanupUploadedImages = async (paths: string[], cause: unknown): Promise<never> => {
  if (paths.length) {
    const { error } = await supabase.storage.from('hotel-images').remove(paths);
    if (error) {
      const message = cause instanceof Error ? cause.message : 'Unable to save the property.';
      throw new Error(`${message} Uploaded photos could not be cleaned up: ${error.message}`);
    }
  }
  throw cause;
};

export default function VendorHotelEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hotelId?: string | string[] }>();
  const hotelId = Array.isArray(params.hotelId) ? params.hotelId[0] : params.hotelId;
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const userId = session?.user.id;
  const approvedVendor = profile?.role === 'vendor'
    && profile.vendor_status === 'approved'
    && !profile.disabled;
  const editing = Boolean(hotelId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Sierra Leone');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [amenities, setAmenities] = useState('');
  const [policies, setPolicies] = useState('');
  const [checkInTime, setCheckInTime] = useState('14:00');
  const [checkOutTime, setCheckOutTime] = useState('11:00');
  const [rooms, setRooms] = useState<ListingRoom[]>([emptyRoom()]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [coverImage, setCoverImage] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(Boolean(hotelId && userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelId || !userId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error: loadError } = await supabase
        .from('hotels')
        .select('id, name, description, location, latitude, longitude, city, country, amenities, approval_status, cover_image, policies, check_in_time, check_out_time, images, rooms')
        .eq('id', hotelId)
        .eq('owner_id', userId)
        .maybeSingle();

      if (cancelled) return;
      if (loadError) {
        setError(loadError.message);
      } else if (!data) {
        setError('This property could not be found in your listings.');
      } else {
        const hotel = data as HotelRow;
        setName(hotel.name);
        setDescription(hotel.description ?? '');
        setLocation(hotel.location);
        setCity(hotel.city);
        setCountry(hotel.country);
        setLatitude(String(hotel.latitude));
        setLongitude(String(hotel.longitude));
        setAmenities(hotel.amenities.join(', '));
        setPolicies(hotel.policies ?? '');
        setCheckInTime(hotel.check_in_time ?? '');
        setCheckOutTime(hotel.check_out_time ?? '');
        setRooms(hotel.rooms.length
          ? hotel.rooms.map((room) => ({ ...room, formId: room.id || emptyRoom().formId, newImages: [] }))
          : [emptyRoom()]);
        setPhotoUrls(hotel.images ?? []);
        setCoverImage(hotel.cover_image ?? '');
        setStatus(hotel.approval_status);
      }
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [hotelId, userId]);

  const choosePhotos = async () => {
    setError(null);
    try {
      if (photos.length >= 10) {
        setError('A property can have up to 10 photos.');
        return;
      }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow photo-library access to add photos to your property listing.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10 - photos.length,
        quality: 0.82,
      });
      if (!result.canceled) {
        setNewPhotos((current) => [...current, ...result.assets].slice(0, 10 - photoUrls.length));
        if (!coverImage && result.assets[0]) {
          setCoverImage(result.assets[0].uri);
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to open your photos.');
    }
  };

  const removePhoto = (uri: string, isNew: boolean) => {
    if (isNew) {
      setNewPhotos((current) => current.filter((photo) => photo.uri !== uri));
    } else {
      setPhotoUrls((current) => current.filter((photo) => photo !== uri));
    }
    if (coverImage === uri) {
      setCoverImage(photoUrls.find((photo) => photo !== uri) ?? newPhotos.find((photo) => photo.uri !== uri)?.uri ?? '');
    }
  };

  const updateRoom = (formId: string, update: Partial<ListingRoom>) => {
    setRooms((current) => current.map((room) => room.formId === formId ? { ...room, ...update } : room));
  };

  const chooseRoomPhotos = async (formId: string) => {
    setError(null);
    const room = rooms.find((item) => item.formId === formId);
    if (!room) return;

    const remaining = 10 - room.images.length - room.newImages.length;
    if (remaining <= 0) {
      setError('A room type can have up to 10 photos.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow photo-library access to add photos to this room.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.82,
      });
      if (!result.canceled) {
        updateRoom(formId, { newImages: [...room.newImages, ...result.assets].slice(0, remaining) });
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to open your photos.');
    }
  };

  const removeRoomPhoto = (formId: string, uri: string, isNew: boolean) => {
    const room = rooms.find((item) => item.formId === formId);
    if (!room) return;
    updateRoom(formId, isNew
      ? { newImages: room.newImages.filter((photo) => photo.uri !== uri) }
      : { images: room.images.filter((image) => image !== uri) });
  };

  const save = async () => {
    setError(null);
    if (!userId) {
      setError('Sign in again to save this property.');
      return;
    }
    if (!editing && !approvedVendor) {
      setError('Your vendor account must be approved before you can publish a property.');
      return;
    }

    const cleanName = name.trim();
    const cleanDescription = description.trim();
    const cleanLocation = location.trim();
    const cleanCity = city.trim();
    const cleanCountry = country.trim();
    const latitudeValue = Number(latitude);
    const longitudeValue = Number(longitude);

    if (!cleanName || !cleanDescription || !cleanLocation || !cleanCity || !cleanCountry) {
      setError('Complete the property name, description, address, city, and country.');
      return;
    }
    if (!Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90
      || !Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180) {
      setError('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    if (rooms.length === 0) {
      setError('Add at least one room type with its nightly price and availability.');
      return;
    }

    const parsedRooms: HotelRoom[] = [];
    for (const room of rooms) {
      const roomType = room.type.trim();
      const price = Number(room.price_per_night);
      const capacity = Number(room.capacity_guests);
      const availableRooms = Number(room.total_rooms);
      if (!roomType || !Number.isFinite(price) || price <= 0
        || !Number.isInteger(capacity) || capacity <= 0
        || !Number.isInteger(availableRooms) || availableRooms <= 0) {
        setError('Each room needs a name, positive nightly price, guest capacity, and available quantity.');
        return;
      }
      parsedRooms.push({
        id: room.id || `${Date.now()}-${parsedRooms.length}`,
        type: roomType,
        price_per_night: price,
        capacity_guests: capacity,
        total_rooms: availableRooms,
        amenities: splitList(room.amenities.join(', ')),
        images: room.images.filter(Boolean),
      });
    }

    const invalidPhotos = [...photoUrls, ...rooms.flatMap((room) => room.images)]
      .filter((uri) => !isValidHttpUrl(uri));
    if (invalidPhotos.length) {
      setError('Saved photo URLs must use a valid http or https URL.');
      return;
    }

    setBusy(true);
    let uploaded: UploadedImages = { urls: [], paths: [] };
    try {
      const roomPhotos = rooms.flatMap((room) => room.newImages);
      const allNewPhotos = [...newPhotos, ...roomPhotos];
      uploaded = await uploadListingImages(userId, allNewPhotos);
      const propertyPhotoUrls = uploaded.urls.slice(0, newPhotos.length);
      const finalImages = [...photoUrls, ...propertyPhotoUrls];
      const selectedCoverIndex = newPhotos.findIndex((photo) => photo.uri === coverImage);
      const finalCover = selectedCoverIndex >= 0
        ? propertyPhotoUrls[selectedCoverIndex] ?? finalImages[0] ?? null
        : (isValidHttpUrl(coverImage) ? coverImage : finalImages[0] ?? null);
      if (finalCover && !finalImages.includes(finalCover) && isValidHttpUrl(finalCover)) {
        finalImages.unshift(finalCover);
      }

      let nextRoomPhotoIndex = newPhotos.length;
      const roomsWithUploadedPhotos = parsedRooms.map((parsedRoom, index) => {
        const roomPhotos = rooms[index].newImages;
        const roomPhotoUrls = uploaded.urls.slice(nextRoomPhotoIndex, nextRoomPhotoIndex + roomPhotos.length);
        nextRoomPhotoIndex += roomPhotos.length;
        return { ...parsedRoom, images: [...parsedRoom.images, ...roomPhotoUrls] };
      });

      const values = {
        owner_id: userId,
        name: cleanName,
        description: cleanDescription,
        price_per_night: Math.min(...roomsWithUploadedPhotos.map((room) => room.price_per_night)),
        location: cleanLocation,
        latitude: latitudeValue,
        longitude: longitudeValue,
        city: cleanCity,
        country: cleanCountry,
        amenities: splitList(amenities),
        policies: policies.trim() || null,
        check_in_time: checkInTime.trim() || null,
        check_out_time: checkOutTime.trim() || null,
        cover_image: finalCover,
        images: finalImages,
        rooms: roomsWithUploadedPhotos,
      };

      if (hotelId) {
        const { data, error: updateError } = await supabase
          .from('hotels')
          .update(values)
          .eq('id', hotelId)
          .eq('owner_id', userId)
          .select('id')
          .maybeSingle();
        if (updateError) throw updateError;
        if (!data) throw new Error('This property could not be updated. Confirm it is still assigned to your account.');
      } else {
        const { error: insertError } = await supabase
          .from('hotels')
          .insert(values);
        if (insertError) throw insertError;
      }

      invalidateCached('hotels:');
      if (hotelId) invalidateCached(`hotel:${hotelId}`);
      invalidateCached(`vendor-hotels:${userId}`);
      invalidateCached(`vendor-dashboard:${userId}`);
      router.replace('/(vendor)/hotels');
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to save the property.';
      if (uploaded.paths.length) {
        try {
          await cleanupUploadedImages(uploaded.paths, caughtError);
        } catch (cleanupError) {
          setError(cleanupError instanceof Error ? cleanupError.message : message);
          return;
        }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const photos = [
    ...photoUrls.map((uri) => ({ uri, isNew: false })),
    ...newPhotos.map((photo) => ({ uri: photo.uri, isNew: true })),
  ];

  if (loading) {
    return <View style={styles.center}><Text style={styles.state}>Loading property details…</Text></View>;
  }

  if (editing && !userId) {
    return <View style={styles.center}><Text style={styles.state}>Sign in again to edit this property.</Text></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>{editing ? 'PROPERTY MANAGEMENT' : 'NEW PROPERTY'}</Text>
            <Text style={styles.heading}>{editing ? 'Edit your listing' : 'Create a property listing'}</Text>
            <Text style={styles.heroSubtitle}>
              Add the details guests need to discover your property and book with confidence.
            </Text>
          </View>
          <View style={styles.heroIcon}><Ionicons name="business-outline" size={25} color="#D8F5F0" /></View>
        </View>

        {!editing ? (
          <View style={styles.publishNote}>
            <View style={styles.publishIcon}><Ionicons name="flash-outline" size={17} color="#087E8B" /></View>
            <Text style={styles.publishText}>
              Your listing will be published as soon as you save it because your vendor account is approved.
            </Text>
          </View>
        ) : status ? (
          <View style={styles.publishNote}>
            <View style={styles.publishIcon}><Ionicons name="information-circle-outline" size={17} color="#087E8B" /></View>
            <Text style={styles.publishText}>
              Listing status: <Text style={styles.publishStrong}>{status}</Text>. Editing details will not change its status.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View accessibilityRole="alert" style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={19} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!approvedVendor && !editing ? (
          <View style={styles.blockedCard}>
            <Ionicons name="lock-closed-outline" size={23} color="#B7791F" />
            <Text style={styles.blockedTitle}>Vendor approval required</Text>
            <Text style={styles.blockedText}>You can create and publish listings after your vendor account is approved.</Text>
          </View>
        ) : (
          <>
            <FormSection icon="create-outline" title="Property details" subtitle="Give guests a clear picture of your accommodation">
              <Field label="Property name *" value={name} onChangeText={setName} placeholder="e.g. Ocean View Guest House" />
              <Field
                label="Description *"
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the property, its atmosphere, and what makes it special"
                multiline
                inputStyle={styles.textArea}
              />
              <Field label="Street address / area *" value={location} onChangeText={setLocation} placeholder="Address or neighborhood" />
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <Field label="City *" value={city} onChangeText={setCity} placeholder="Freetown" />
                </View>
                <View style={styles.formHalf}>
                  <Field label="Country *" value={country} onChangeText={setCountry} placeholder="Sierra Leone" />
                </View>
              </View>
              <Text style={styles.fieldHint}>Coordinates help guests find you on the map.</Text>
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <Field label="Latitude *" value={latitude} onChangeText={setLatitude} placeholder="8.4657" keyboardType="decimal-pad" />
                </View>
                <View style={styles.formHalf}>
                  <Field label="Longitude *" value={longitude} onChangeText={setLongitude} placeholder="-13.2317" keyboardType="decimal-pad" />
                </View>
              </View>
              <Field
                label="Amenities"
                value={amenities}
                onChangeText={setAmenities}
                placeholder="Wi-Fi, Air conditioning, Parking, Restaurant"
                hint="Separate amenities with commas."
              />
            </FormSection>

            <FormSection icon="images-outline" title="Property photos" subtitle="Add up to 10 photos and choose the cover guests see first">
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.photoPicker}
                onPress={() => void choosePhotos()}
                disabled={busy}
              >
                <View style={styles.photoPickerIcon}><Ionicons name="cloud-upload-outline" size={21} color="#087E8B" /></View>
                <View style={styles.photoPickerCopy}>
                  <Text style={styles.photoPickerTitle}>Choose property photos</Text>
                  <Text style={styles.photoPickerHint}>JPEG, PNG, WebP, or HEIC · 10 MB max per photo</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color="#087E8B" />
              </TouchableOpacity>
              {photos.length ? (
                <View style={styles.photoGrid}>
                  {photos.map((photo) => (
                    <View key={photo.uri} style={styles.photoTile}>
                      <Image source={{ uri: photo.uri }} style={styles.photoThumb} resizeMode="cover" />
                      {coverImage === photo.uri ? (
                        <View style={styles.coverTag}><Text style={styles.coverTagText}>COVER</Text></View>
                      ) : (
                        <TouchableOpacity
                          style={styles.makeCoverButton}
                          onPress={() => setCoverImage(photo.uri)}
                          accessibilityRole="button"
                          accessibilityLabel="Set as cover photo"
                        >
                          <Ionicons name="star-outline" size={13} color="#FFFFFF" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.removePhoto}
                        onPress={() => removePhoto(photo.uri, photo.isNew)}
                        accessibilityRole="button"
                        accessibilityLabel="Remove photo"
                      >
                        <Ionicons name="close" size={13} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.fieldHint}>No photos added yet. A cover photo is recommended for search results.</Text>
              )}
            </FormSection>

            <FormSection icon="bed-outline" title="Rooms and rates" subtitle="Add each room category with nightly prices and capacity">
              {rooms.map((room, index) => (
                <View key={room.formId} style={styles.roomCard}>
                  <View style={styles.roomHeading}>
                    <Text style={styles.roomTitle}>Room type {index + 1}</Text>
                    {rooms.length > 1 ? (
                      <TouchableOpacity
                        onPress={() => setRooms((current) => current.filter((item) => item.formId !== room.formId))}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove room type ${index + 1}`}
                      >
                        <Ionicons name="trash-outline" size={17} color="#B42318" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Field label="Room name *" value={room.type} onChangeText={(value) => updateRoom(room.formId, { type: value })} placeholder="Standard Double" />
                  <View style={styles.formRow}>
                    <View style={styles.formHalf}>
                      <Field
                        label="Price per night (SLE) *"
                        value={room.price_per_night ? String(room.price_per_night) : ''}
                        onChangeText={(value) => updateRoom(room.formId, { price_per_night: Number(value) || 0 })}
                        placeholder="850"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.formHalf}>
                      <Field
                        label="Guests per room *"
                        value={String(room.capacity_guests || '')}
                        onChangeText={(value) => updateRoom(room.formId, { capacity_guests: Number(value) || 0 })}
                        placeholder="2"
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>
                  <Field
                    label="Available rooms *"
                    value={String(room.total_rooms || '')}
                    onChangeText={(value) => updateRoom(room.formId, { total_rooms: Number(value) || 0 })}
                    placeholder="1"
                    keyboardType="number-pad"
                  />
                  <Field
                    label="Room amenities"
                    value={room.amenities.join(', ')}
                    onChangeText={(value) => updateRoom(room.formId, { amenities: splitList(value) })}
                    placeholder="Queen bed, Ensuite bathroom, Balcony"
                    hint="Separate amenities with commas."
                  />
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.photoPicker}
                    onPress={() => void chooseRoomPhotos(room.formId)}
                    disabled={busy}
                  >
                    <View style={styles.photoPickerIcon}><Ionicons name="cloud-upload-outline" size={21} color="#087E8B" /></View>
                    <View style={styles.photoPickerCopy}>
                      <Text style={styles.photoPickerTitle}>Choose room photos</Text>
                      <Text style={styles.photoPickerHint}>Up to 10 photos · JPEG, PNG, WebP, or HEIC</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color="#087E8B" />
                  </TouchableOpacity>
                  {room.images.length || room.newImages.length ? (
                    <View style={styles.photoGrid}>
                      {[
                        ...room.images.map((uri) => ({ uri, isNew: false })),
                        ...room.newImages.map((photo) => ({ uri: photo.uri, isNew: true })),
                      ].map((photo) => (
                        <View key={photo.uri} style={styles.photoTile}>
                          <Image source={{ uri: photo.uri }} style={styles.photoThumb} resizeMode="cover" />
                          <TouchableOpacity
                            style={styles.removePhoto}
                            onPress={() => removeRoomPhoto(room.formId, photo.uri, photo.isNew)}
                            accessibilityRole="button"
                            accessibilityLabel="Remove room photo"
                          >
                            <Ionicons name="close" size={13} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.fieldHint}>Optional. Add photos that show this room type.</Text>
                  )}
                </View>
              ))}
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.addRoomButton}
                onPress={() => setRooms((current) => [...current, emptyRoom()])}
              >
                <Ionicons name="add-circle-outline" size={18} color="#087E8B" />
                <Text style={styles.addRoomText}>Add another room type</Text>
              </TouchableOpacity>
            </FormSection>

            <FormSection icon="time-outline" title="Check-in and check-out" subtitle="Let guests know when they can arrive and depart">
              <View style={styles.formRow}>
                <View style={styles.formHalf}>
                  <Field label="Check-in time" value={checkInTime} onChangeText={setCheckInTime} placeholder="14:00" />
                </View>
                <View style={styles.formHalf}>
                  <Field label="Check-out time" value={checkOutTime} onChangeText={setCheckOutTime} placeholder="11:00" />
                </View>
              </View>
            </FormSection>

            <FormSection icon="document-text-outline" title="Policies" subtitle="Share important rules and guest information">
              <Field
                label="Property policies"
                value={policies}
                onChangeText={setPolicies}
                placeholder="Cancellation terms, quiet hours, check-in requirements, children or pet policy…"
                multiline
                inputStyle={styles.textArea}
              />
            </FormSection>

            <View style={styles.footerActions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.cancelButton}
                onPress={() => router.back()}
                disabled={busy}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.saveButton, busy && styles.disabledButton]}
                onPress={() => void save()}
                disabled={busy}
              >
                <Ionicons name={busy ? 'hourglass-outline' : 'checkmark-circle-outline'} size={17} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>{busy ? 'Saving listing…' : editing ? 'Save changes' : 'Publish property'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  hint?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'number-pad';
  inputStyle?: object;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  multiline = false,
  keyboardType = 'default',
  inputStyle,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#95A4AA"
        style={[styles.input, multiline && styles.multilineInput, inputStyle]}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize="sentences"
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

interface FormSectionProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function FormSection({ icon, title, subtitle, children }: FormSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}><Ionicons name={icon} size={17} color="#087E8B" /></View>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F7F8',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F4F7F8',
  },
  container: {
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
    padding: 22,
    paddingBottom: 48,
    gap: 15,
  },
  hero: {
    minHeight: 133,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#173B4A',
  },
  heroCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#A5DCD7',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 7,
  },
  heroSubtitle: {
    color: '#C2D4D9',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
    maxWidth: 560,
  },
  heroIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  publishNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CFE5E1',
    borderRadius: 11,
    backgroundColor: '#F0FAF8',
  },
  publishIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDF1EE',
  },
  publishText: {
    flex: 1,
    color: '#55716F',
    fontSize: 10,
    lineHeight: 15,
  },
  publishStrong: {
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 13,
    borderWidth: 1,
    borderColor: '#F5D6D3',
    borderRadius: 11,
    backgroundColor: '#FFF7F6',
  },
  errorText: {
    flex: 1,
    color: '#A64339',
    fontSize: 11,
    lineHeight: 16,
  },
  blockedCard: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0E2C4',
    backgroundColor: '#FFFBF2',
  },
  blockedTitle: {
    color: '#76541F',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
  },
  blockedText: {
    color: '#8C744F',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
    textAlign: 'center',
  },
  section: {
    padding: 17,
    borderWidth: 1,
    borderColor: '#E7EDEF',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 17,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F4',
  },
  sectionHeadingCopy: {
    flex: 1,
  },
  sectionTitle: {
    color: '#17354B',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#8B9AA1',
    fontSize: 9,
    marginTop: 3,
  },
  field: {
    marginBottom: 13,
  },
  fieldLabel: {
    color: '#405A66',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
  },
  input: {
    minHeight: 43,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#DCE5E7',
    borderRadius: 10,
    color: '#17354B',
    backgroundColor: '#FBFCFC',
    fontSize: 12,
  },
  multilineInput: {
    minHeight: 100,
    paddingTop: 11,
  },
  textArea: {
    minHeight: 116,
  },
  smallTextArea: {
    minHeight: 70,
  },
  fieldHint: {
    color: '#8B9AA1',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 5,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formHalf: {
    flex: 1,
    minWidth: 0,
  },
  photoPicker: {
    minHeight: 65,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B8D1D4',
    borderRadius: 11,
    backgroundColor: '#FBFEFD',
  },
  photoPickerIcon: {
    width: 37,
    height: 37,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F4',
  },
  photoPickerCopy: {
    flex: 1,
  },
  photoPickerTitle: {
    color: '#294655',
    fontSize: 10,
    fontWeight: '800',
  },
  photoPickerHint: {
    color: '#8B9AA1',
    fontSize: 9,
    marginTop: 4,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 12,
  },
  photoTile: {
    position: 'relative',
    width: 82,
    height: 74,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#EDF3F4',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  coverTag: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#087E8B',
  },
  coverTagText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '900',
  },
  makeCoverButton: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 21,
    height: 21,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,45,60,0.8)',
  },
  removePhoto: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 21,
    height: 21,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(164,55,47,0.9)',
  },
  roomCard: {
    marginBottom: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E9EFF0',
    borderRadius: 11,
    backgroundColor: '#FBFCFC',
  },
  roomHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  roomTitle: {
    color: '#294655',
    fontSize: 11,
    fontWeight: '800',
  },
  addRoomButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#CFE5E1',
    borderRadius: 10,
    backgroundColor: '#F0FAF8',
  },
  addRoomText: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 2,
  },
  cancelButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D6E0E2',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  cancelText: {
    color: '#526974',
    fontSize: 11,
    fontWeight: '800',
  },
  saveButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#087E8B',
  },
  disabledButton: {
    opacity: 0.55,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  state: {
    color: '#718397',
    textAlign: 'center',
  },
});
