import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { getCached, invalidateCached, loadCached } from '@/lib/query-cache';
import { useAuthStore } from '@/store/auth.store';

interface VendorHotel {
  id: string;
  name: string;
  description: string;
  city: string;
  country: string;
  approval_status: string;
  rejection_reason: string | null;
  cover_image: string | null;
  rooms: { type?: string; price_per_night?: number }[];
  created_at: string;
}

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-SL', {
    style: 'currency',
    currency: 'SLE',
    maximumFractionDigits: 0,
  }).format(amount);

export default function VendorHotelsIndexScreen() {
  const userId = useAuthStore((state) => state.session?.user.id ?? null);
  const profile = useAuthStore((state) => state.profile);
  const [hotels, setHotels] = useState<VendorHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAddHotel = profile?.role === 'vendor'
    && profile.vendor_status === 'approved'
    && !profile.disabled;

  const loadHotels = useCallback(async (pull = false) => {
    if (!userId) {
      setError('Sign in again to manage your properties.');
      setLoading(false);
      return;
    }

    const cacheKey = `vendor-hotels:${userId}`;
    if (pull) setRefreshing(true);
    else if (!getCached<VendorHotel[]>(cacheKey)) setLoading(true);
    setError(null);
    try {
      const data = await loadCached(cacheKey, async () => {
        const { data: rows, error: queryError } = await supabase
          .from('hotels')
          .select('id, name, description, city, country, approval_status, rejection_reason, cover_image, rooms, created_at')
          .eq('owner_id', userId)
          .order('created_at', { ascending: false });
        if (queryError) throw queryError;
        return (rows ?? []) as VendorHotel[];
      }, 20000, pull);
      setHotels(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load your properties.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const refreshHotels = useCallback(() => {
    if (userId) invalidateCached(`vendor-hotels:${userId}`);
    void loadHotels(true);
  }, [loadHotels, userId]);

  useFocusEffect(useCallback(() => {
    void loadHotels();
  }, [loadHotels]));

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshHotels} />}
    >
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>YOUR INVENTORY</Text>
          <Text style={styles.heading}>Manage properties</Text>
          <Text style={styles.subtitle}>Keep your hotel details, room rates, and guest information up to date.</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="business-outline" size={25} color="#D8F5F0" />
        </View>
      </View>

      <View style={styles.listHeading}>
        <View>
          <Text style={styles.sectionTitle}>Your properties</Text>
          <Text style={styles.sectionSubtitle}>{hotels.length} listing{hotels.length === 1 ? '' : 's'}</Text>
        </View>
        {canAddHotel ? (
          <Link href="/(vendor)/hotels/new" asChild>
            <TouchableOpacity style={styles.addButton} accessibilityRole="button">
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add property</Text>
            </TouchableOpacity>
          </Link>
        ) : null}
      </View>

      {!canAddHotel ? (
        <View style={styles.noticeCard}>
          <View style={styles.noticeIcon}><Ionicons name="time-outline" size={19} color="#B7791F" /></View>
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>Vendor approval required</Text>
            <Text style={styles.noticeText}>
              {profile?.vendor_status === 'rejected'
                ? 'Your vendor application needs attention before you can publish a property.'
                : 'You can create and publish hotel listings as soon as your vendor account is approved.'}
            </Text>
          </View>
        </View>
      ) : null}

      {loading ? <Text style={styles.state}>Loading your properties…</Text> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void loadHotels()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && !error && hotels.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Ionicons name="home-outline" size={27} color="#087E8B" /></View>
          <Text style={styles.emptyTitle}>Your property portfolio starts here</Text>
          <Text style={styles.emptyText}>
            Add a complete listing with location, photos, amenities, house policies, and room pricing.
          </Text>
          {canAddHotel ? (
            <Link href="/(vendor)/hotels/new" asChild>
              <TouchableOpacity style={styles.emptyButton} accessibilityRole="button">
                <Text style={styles.emptyButtonText}>Create your first listing</Text>
                <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
              </TouchableOpacity>
            </Link>
          ) : null}
        </View>
      ) : null}

      {hotels.map((hotel) => {
        const cheapestRoom = hotel.rooms
          .map((room) => Number(room.price_per_night ?? 0))
          .filter((price) => price > 0)
          .sort((left, right) => left - right)[0];
        const statusApproved = hotel.approval_status === 'approved';

        return (
          <View key={hotel.id} style={styles.hotelCard}>
            {hotel.cover_image ? (
              <Image source={{ uri: hotel.cover_image }} style={styles.hotelImage} resizeMode="cover" />
            ) : (
              <View style={[styles.hotelImage, styles.imagePlaceholder]}>
                <Ionicons name="business-outline" size={30} color="#8DA5AC" />
              </View>
            )}
            <View style={styles.hotelInfo}>
              <View style={styles.hotelTitleRow}>
                <View style={styles.hotelTitleCopy}>
                  <Text style={styles.hotelName} numberOfLines={1}>{hotel.name}</Text>
                  <Text style={styles.hotelLocation} numberOfLines={1}>
                    <Ionicons name="location-outline" size={13} color="#82939B" /> {hotel.city}, {hotel.country}
                  </Text>
                </View>
                <View style={[styles.statusBadge, statusApproved ? styles.approvedBadge : styles.reviewBadge]}>
                  <View style={[styles.statusDot, statusApproved ? styles.approvedDot : styles.reviewDot]} />
                  <Text style={[styles.statusText, statusApproved ? styles.approvedText : styles.reviewText]}>
                    {statusApproved ? 'Published' : hotel.approval_status}
                  </Text>
                </View>
              </View>
              <Text style={styles.description} numberOfLines={2}>{hotel.description}</Text>
              <View style={styles.hotelMetaRow}>
                <Text style={styles.hotelMeta}>
                  <Ionicons name="bed-outline" size={14} color="#087E8B" /> {hotel.rooms.length} room type{hotel.rooms.length === 1 ? '' : 's'}
                </Text>
                {cheapestRoom ? (
                  <Text style={styles.hotelPrice}>From {formatMoney(cheapestRoom)} / night</Text>
                ) : null}
              </View>
              {hotel.rejection_reason ? (
                <Text style={styles.rejectionNote}>Review note: {hotel.rejection_reason}</Text>
              ) : null}
              <View style={styles.cardDivider} />
              <View style={styles.cardFooter}>
                <Text style={styles.updatedText}>Added {new Date(hotel.created_at).toLocaleDateString()}</Text>
                <Link href={{ pathname: '/(vendor)/hotels/new', params: { hotelId: hotel.id } }} asChild>
                  <TouchableOpacity style={styles.editButton} accessibilityRole="button" accessibilityLabel={`Edit ${hotel.name}`}>
                    <Ionicons name="create-outline" size={15} color="#087E8B" />
                    <Text style={styles.editButtonText}>Edit listing</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 22,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    minHeight: 139,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 21,
    borderRadius: 17,
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
    fontSize: 22,
    fontWeight: '900',
    marginTop: 7,
  },
  subtitle: {
    maxWidth: 470,
    color: '#C2D4D9',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  heroIcon: {
    width: 48,
    height: 48,
    marginLeft: 12,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  sectionTitle: {
    color: '#17354B',
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#8B9AA1',
    fontSize: 10,
    marginTop: 4,
  },
  addButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: '#087E8B',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0E2C4',
    backgroundColor: '#FFFBF2',
  },
  noticeIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0D3',
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    color: '#76541F',
    fontSize: 11,
    fontWeight: '800',
  },
  noticeText: {
    color: '#8C744F',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  state: {
    color: '#718397',
    paddingVertical: 12,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 13,
    borderRadius: 11,
    backgroundColor: '#FFF7F6',
  },
  errorText: {
    flex: 1,
    color: '#A64339',
    fontSize: 11,
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#A84339',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 27,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EFF0',
    backgroundColor: '#FFFFFF',
  },
  emptyIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
    backgroundColor: '#EAF5F4',
  },
  emptyTitle: {
    color: '#17354B',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 360,
    color: '#84949A',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 17,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#087E8B',
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  hotelCard: {
    overflow: 'hidden',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E8EFF0',
    backgroundColor: '#FFFFFF',
  },
  hotelImage: {
    width: '100%',
    height: 185,
    backgroundColor: '#EDF3F4',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotelInfo: {
    padding: 16,
  },
  hotelTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  hotelTitleCopy: {
    flex: 1,
  },
  hotelName: {
    color: '#17354B',
    fontSize: 16,
    fontWeight: '900',
  },
  hotelLocation: {
    color: '#82939B',
    fontSize: 10,
    marginTop: 5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
  },
  approvedBadge: {
    backgroundColor: '#E8F5EC',
  },
  reviewBadge: {
    backgroundColor: '#FFF3E5',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  approvedDot: {
    backgroundColor: '#2B8051',
  },
  reviewDot: {
    backgroundColor: '#C47A2C',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  approvedText: {
    color: '#2B8051',
  },
  reviewText: {
    color: '#AE6B20',
  },
  description: {
    color: '#687D86',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
  },
  hotelMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  hotelMeta: {
    color: '#617780',
    fontSize: 10,
    fontWeight: '700',
  },
  hotelPrice: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
  },
  rejectionNote: {
    color: '#A64339',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 10,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#EDF1F1',
    marginTop: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 11,
  },
  updatedText: {
    color: '#9AA7AC',
    fontSize: 9,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#EAF5F4',
  },
  editButtonText: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
  },
});
