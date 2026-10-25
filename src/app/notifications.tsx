import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { getCached, invalidateCached, loadCached } from '@/lib/query-cache';

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  booking_id: string | null;
  created_at: string;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const session = useAuthStore((state: { session: { user: { id: string } } | null }) => state.session);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user?.id;

  const loadNotifications = useCallback(async (forceRefresh = false) => {
    if (!userId) {
      setItems([]);
      return;
    }

    const cacheKey = `notifications:${userId}`;
    const cached = getCached<NotificationRow[]>(cacheKey);
    if (cached) setItems(cached);
    else setLoading(true);
    setError(null);
    try {
      const data = await loadCached(cacheKey, async () => {
        const { data: rows, error: fetchError } = await supabase
          .from('notifications')
          .select('id, title, message, read, booking_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100);
        if (fetchError) throw fetchError;
        return (rows ?? []) as NotificationRow[];
      }, 15000, forceRefresh);
      setItems(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load notifications');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;
    let fallbackInterval: ReturnType<typeof setInterval> | undefined;

    const stopFallbackPolling = () => {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = undefined;
      }
    };

    const initialLoad = setTimeout(() => {
      if (active) {
        void loadNotifications();
      }
    }, 0);
    const channelTopic = `notifications-screen-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelTopic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        if (active) {
          void loadNotifications(true);
        }
      })
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          stopFallbackPolling();
          fallbackInterval = setInterval(() => {
            if (active) {
              void loadNotifications();
            }
          }, 15000);
        }
      });

    return () => {
      active = false;
      clearTimeout(initialLoad);
      stopFallbackPolling();
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, userId]);

  const markAllRead = async () => {
    if (!userId) {
      return;
    }

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    invalidateCached(`notifications:${userId}`);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
  };

  const openNotification = async (item: NotificationRow) => {
    if (userId && !item.read) {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', item.id)
        .eq('user_id', userId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      invalidateCached(`notifications:${userId}`);
      setItems((current) => current.map((notification) =>
        notification.id === item.id ? { ...notification, read: true } : notification,
      ));
    }

    if (item.booking_id) {
      router.push({ pathname: '/booking/[id]', params: { id: item.booking_id } });
    }
  };

  if (!userId) {
    return (
      <View style={styles.guestWrap}>
        <View style={styles.guestIcon}><Ionicons name="notifications-outline" size={29} color="#087E8B" /></View>
        <Text style={styles.heading}>Your notifications</Text>
        <Text style={styles.guestText}>Sign in to see updates about your bookings and payments.</Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => router.push('/login')}>
          <Text style={styles.signInText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const unreadCount = items.filter((item) => !item.read).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>SL STAY</Text>
          <Text style={styles.heading}>Notifications</Text>
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={() => void markAllRead()} accessibilityRole="button">
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Loading your updates…</Text>
        </View>
      ) : null}
      {!loading && items.length === 0 && !error ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Ionicons name="notifications-outline" size={25} color="#087E8B" /></View>
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptyText}>Booking and payment updates will show up here.</Text>
        </View>
      ) : null}

      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.notificationCard, !item.read ? styles.unreadCard : null]}
          onPress={() => void openNotification(item)}
          activeOpacity={item.booking_id ? 0.75 : 1}
          accessibilityRole={item.booking_id ? 'button' : undefined}
        >
          <View style={[styles.notificationIcon, !item.read ? styles.unreadIcon : null]}>
            <Ionicons name={iconFor(item.title)} size={19} color="#087E8B" />
          </View>
          <View style={styles.notificationContent}>
            <View style={styles.titleRow}>
              <Text style={styles.notificationTitle}>{item.title}</Text>
              {!item.read ? <View style={styles.unreadDot} /> : null}
            </View>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
            {item.booking_id ? (
              <View style={styles.bookingLink}>
                <Text style={styles.bookingLinkText}>View booking</Text>
                <Ionicons name="arrow-forward" size={14} color="#087E8B" />
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function iconFor(title: string): React.ComponentProps<typeof Ionicons>['name'] {
  const normalized = title.toLowerCase();
  if (normalized.includes('payment') || normalized.includes('refund')) {
    return 'card-outline';
  }
  if (normalized.includes('cancel')) {
    return 'close-circle-outline';
  }
  if (normalized.includes('complete') || normalized.includes('accepted')) {
    return 'checkmark-circle-outline';
  }
  return 'calendar-outline';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F6F7',
  },
  container: {
    flexGrow: 1,
    padding: 18,
    paddingBottom: 28,
    gap: 11,
    backgroundColor: '#F5F6F7',
  },
  headerRow: {
    minHeight: 67,
    marginBottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heading: {
    marginTop: 4,
    color: '#17354B',
    fontSize: 25,
    fontWeight: '800',
  },
  markAll: {
    color: '#087E8B',
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    color: '#B42318',
    fontSize: 12,
  },
  emptyCard: {
    minHeight: 190,
    padding: 20,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EAF4F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: {
    color: '#17354B',
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    maxWidth: 280,
    color: '#718397',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  notificationCard: {
    padding: 13,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7ECEE',
  },
  unreadCard: {
    borderColor: '#C9E1E2',
    backgroundColor: '#FCFFFF',
  },
  notificationIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadIcon: {
    backgroundColor: '#E5F2F2',
  },
  notificationContent: {
    flex: 1,
  },
  titleRow: {
    minHeight: 21,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  notificationTitle: {
    flex: 1,
    color: '#17354B',
    fontSize: 13,
    fontWeight: '800',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#087E8B',
  },
  message: {
    marginTop: 4,
    color: '#627582',
    fontSize: 12,
    lineHeight: 17,
  },
  date: {
    marginTop: 8,
    color: '#91A0A9',
    fontSize: 10,
  },
  bookingLink: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bookingLinkText: {
    color: '#087E8B',
    fontSize: 11,
    fontWeight: '800',
  },
  guestWrap: {
    flex: 1,
    padding: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F6F7',
  },
  guestIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E7F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestText: {
    marginTop: 9,
    maxWidth: 300,
    color: '#718397',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  signInButton: {
    marginTop: 17,
    minWidth: 150,
    minHeight: 45,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
  },
  signInText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
