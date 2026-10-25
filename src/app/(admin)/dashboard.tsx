import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { loadAdminOverview, type AdminOverview } from '@/services/admin';

const formatDate = (value: string) => new Date(value).toLocaleString();

const metrics = [
  { key: 'users', label: 'Registered users', icon: 'people-outline', tint: '#2879B8', background: '#EAF4FC' },
  { key: 'vendors', label: 'Total partners', icon: 'briefcase-outline', tint: '#7861BB', background: '#F1EDFC' },
  { key: 'hotels', label: 'Properties', icon: 'business-outline', tint: '#087E8B', background: '#E8F5F3' },
  { key: 'bookings', label: 'Total bookings', icon: 'calendar-outline', tint: '#C47A2C', background: '#FFF3E5' },
] as const;

const quickLinks = [
  { label: 'Review vendors', detail: 'Check partner applications', icon: 'people-outline', href: '/(admin)/vendors' as const },
  { label: 'Manage properties', detail: 'Optional listing moderation', icon: 'business-outline', href: '/(admin)/hotels' as const },
  { label: 'View bookings', detail: 'Track reservations', icon: 'calendar-outline', href: '/(admin)/bookings' as const },
] as const;

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setOverview(await loadAdminOverview());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load the admin dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeout);
  }, [refresh]);

  const vendorApprovalCount = (overview?.approvedVendors ?? 0) + (overview?.pendingVendors ?? 0);
  const approvalProgress = vendorApprovalCount === 0
    ? 0
    : Math.round(((overview?.approvedVendors ?? 0) / vendorApprovalCount) * 100);

  return (
    <ScrollView
      contentContainerStyle={[styles.container, compact && styles.containerCompact]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <View style={[styles.welcomeCard, compact && styles.welcomeCardCompact]}>
        <View style={styles.welcomeCopy}>
          <Text style={styles.eyebrow}>OPERATIONS CENTER</Text>
          <Text style={styles.welcomeTitle}>Good day, Admin</Text>
          <Text style={styles.welcomeSubtitle}>
            Here’s what’s happening across your SL Stay marketplace.
          </Text>
        </View>
        <View style={styles.welcomeIcon}>
          <Ionicons name="analytics-outline" size={31} color="#D8F5F0" />
        </View>
      </View>

      {loading ? <Text style={styles.state}>Loading your overview…</Text> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>Dashboard unavailable</Text>
            <Text style={styles.error}>{error}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => void refresh()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {overview ? (
        <>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Marketplace overview</Text>
              <Text style={styles.sectionSubtitle}>Live totals from your platform</Text>
            </View>
            <View style={styles.liveIndicator}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
          </View>

          <View style={[styles.metricGrid, compact && styles.metricGridCompact]}>
            {metrics.map((metric) => (
              <View key={metric.key} style={[styles.metricCard, compact && styles.metricCardCompact]}>
                <View style={styles.metricTop}>
                  <View style={[styles.metricIcon, { backgroundColor: metric.background }]}>
                    <Ionicons name={metric.icon} size={19} color={metric.tint} />
                  </View>
                  <Ionicons name="trending-up-outline" size={17} color="#A0AFB5" />
                </View>
                <Text style={styles.metricValue}>{overview[metric.key].toLocaleString()}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.detailGrid, compact && styles.detailGridCompact]}>
            <View style={[styles.panel, styles.approvalsPanel]}>
              <View style={styles.panelHeading}>
                <View>
                  <Text style={styles.panelTitle}>Partner approvals</Text>
                  <Text style={styles.panelSubtitle}>Application pipeline</Text>
                </View>
                <View style={styles.panelIcon}><Ionicons name="shield-checkmark-outline" size={18} color="#087E8B" /></View>
              </View>
              <View style={styles.approvalStats}>
                <View style={styles.approvalStat}>
                  <Text style={styles.approvalValue}>{overview.approvedVendors}</Text>
                  <Text style={styles.approvalLabel}>Approved</Text>
                </View>
                <View style={styles.approvalDivider} />
                <View style={styles.approvalStat}>
                  <Text style={[styles.approvalValue, styles.pendingValue]}>{overview.pendingVendors}</Text>
                  <Text style={styles.approvalLabel}>Awaiting review</Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${approvalProgress}%` }]} />
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.panelLink}
                onPress={() => router.push('/(admin)/vendors')}
              >
                <Text style={styles.panelLinkText}>Manage vendor applications</Text>
                <Ionicons name="arrow-forward" size={15} color="#087E8B" />
              </TouchableOpacity>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Needs attention</Text>
              <Text style={styles.panelSubtitle}>Items awaiting your review</Text>
              <View style={styles.attentionRow}>
                <View style={[styles.attentionIcon, { backgroundColor: '#FFF3E5' }]}>
                  <Ionicons name="business-outline" size={17} color="#C47A2C" />
                </View>
                <Text style={styles.attentionLabel}>Properties needing review</Text>
                <Text style={styles.attentionValue}>{overview.pendingHotels}</Text>
              </View>
              <View style={styles.attentionRow}>
                <View style={[styles.attentionIcon, { backgroundColor: '#F1EDFC' }]}>
                  <Ionicons name="people-outline" size={17} color="#7861BB" />
                </View>
                <Text style={styles.attentionLabel}>Vendor applications</Text>
                <Text style={styles.attentionValue}>{overview.pendingVendors}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.panelLink}
                onPress={() => router.push('/(admin)/hotels')}
              >
                <Text style={styles.panelLinkText}>Review pending items</Text>
                <Ionicons name="arrow-forward" size={15} color="#087E8B" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.detailGrid, compact && styles.detailGridCompact]}>
            <View style={styles.panel}>
              <View style={styles.panelHeading}>
                <View>
                  <Text style={styles.panelTitle}>Recent activity</Text>
                  <Text style={styles.panelSubtitle}>Latest updates on your platform</Text>
                </View>
                <View style={styles.panelIcon}><Ionicons name="pulse-outline" size={18} color="#087E8B" /></View>
              </View>
              {overview.activity.length === 0 ? (
                <Text style={styles.emptyState}>There’s no recent activity to show.</Text>
              ) : (
                overview.activity.slice(0, 6).map((item) => (
                  <View key={item.id} style={styles.activityItem}>
                    <View style={[styles.activityIcon, item.kind === 'booking' && styles.bookingActivityIcon]}>
                      <Ionicons
                        name={item.kind === 'booking' ? 'calendar-outline' : 'notifications-outline'}
                        size={16}
                        color={item.kind === 'booking' ? '#2879B8' : '#087E8B'}
                      />
                    </View>
                    <View style={styles.activityCopy}>
                      <Text style={styles.activityTitle}>{item.title}</Text>
                      <Text style={styles.activityDetail} numberOfLines={2}>{item.detail}</Text>
                    </View>
                    <Text style={styles.timestamp}>{formatDate(item.created_at)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Quick actions</Text>
              <Text style={styles.panelSubtitle}>Common workspace tasks</Text>
              {quickLinks.map((link) => (
                <TouchableOpacity
                  key={link.label}
                  accessibilityRole="button"
                  style={styles.quickLink}
                  onPress={() => router.push(link.href)}
                >
                  <View style={styles.quickIcon}>
                    <Ionicons name={link.icon} size={17} color="#087E8B" />
                  </View>
                  <View style={styles.quickCopy}>
                    <Text style={styles.quickTitle}>{link.label}</Text>
                    <Text style={styles.quickDetail}>{link.detail}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#91A1A8" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 28,
    paddingBottom: 42,
    gap: 21,
  },
  containerCompact: {
    padding: 16,
    gap: 17,
  },
  welcomeCard: {
    minHeight: 153,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 27,
    paddingVertical: 23,
    borderRadius: 19,
    backgroundColor: '#173B4A',
    overflow: 'hidden',
  },
  welcomeCardCompact: {
    minHeight: 142,
    paddingHorizontal: 19,
  },
  welcomeCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#A5DCD7',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  welcomeTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 9,
  },
  welcomeSubtitle: {
    color: '#C2D4D9',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    maxWidth: 470,
  },
  welcomeIcon: {
    width: 61,
    height: 61,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#17354B',
    fontSize: 17,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#8B9AA1',
    fontSize: 11,
    marginTop: 4,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D7E9E4',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2EAA79',
  },
  liveText: {
    color: '#4B8371',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,
  },
  metricGridCompact: {
    gap: 10,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 143,
    padding: 17,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E9EFF0',
    backgroundColor: '#FFFFFF',
  },
  metricCardCompact: {
    flexBasis: '46%',
    minWidth: 0,
    padding: 13,
  },
  metricTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricIcon: {
    width: 37,
    height: 37,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    color: '#17354B',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 15,
  },
  metricLabel: {
    color: '#798B94',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  detailGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  detailGridCompact: {
    flexDirection: 'column',
  },
  panel: {
    flex: 1,
    minWidth: 0,
    padding: 18,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E9EFF0',
    backgroundColor: '#FFFFFF',
  },
  approvalsPanel: {
    flex: 1.15,
  },
  panelHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  panelTitle: {
    color: '#17354B',
    fontSize: 14,
    fontWeight: '800',
  },
  panelSubtitle: {
    color: '#8B9AA1',
    fontSize: 10,
    marginTop: 4,
  },
  panelIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F4',
  },
  approvalStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  approvalStat: {
    flex: 1,
  },
  approvalValue: {
    color: '#087E8B',
    fontSize: 24,
    fontWeight: '900',
  },
  pendingValue: {
    color: '#C47A2C',
  },
  approvalLabel: {
    color: '#84949A',
    fontSize: 10,
    marginTop: 3,
  },
  approvalDivider: {
    width: 1,
    height: 37,
    backgroundColor: '#E7EDEF',
    marginHorizontal: 14,
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: '#EDF2F2',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#39A993',
  },
  panelLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingTop: 15,
  },
  panelLinkText: {
    color: '#087E8B',
    fontSize: 11,
    fontWeight: '800',
  },
  attentionRow: {
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF2F2',
  },
  attentionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionLabel: {
    flex: 1,
    color: '#526974',
    fontSize: 11,
    fontWeight: '600',
  },
  attentionValue: {
    color: '#17354B',
    fontSize: 14,
    fontWeight: '900',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#EFF2F2',
  },
  activityIcon: {
    width: 33,
    height: 33,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5F3',
  },
  bookingActivityIcon: {
    backgroundColor: '#EAF4FC',
  },
  activityCopy: {
    flex: 1,
  },
  activityTitle: {
    color: '#294655',
    fontSize: 11,
    fontWeight: '800',
  },
  activityDetail: {
    color: '#84949A',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  timestamp: {
    maxWidth: 92,
    color: '#9AA7AC',
    fontSize: 9,
    textAlign: 'right',
  },
  emptyState: {
    color: '#84949A',
    fontSize: 12,
    paddingVertical: 14,
  },
  quickLink: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#EFF2F2',
  },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF5F4',
  },
  quickCopy: {
    flex: 1,
  },
  quickTitle: {
    color: '#294655',
    fontSize: 11,
    fontWeight: '800',
  },
  quickDetail: {
    color: '#8B9AA1',
    fontSize: 9,
    marginTop: 3,
  },
  state: {
    color: '#718397',
    paddingVertical: 10,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F5D6D3',
    borderRadius: 13,
    backgroundColor: '#FFF7F6',
  },
  errorCopy: {
    flex: 1,
  },
  errorTitle: {
    color: '#8F241C',
    fontSize: 12,
    fontWeight: '800',
  },
  error: {
    color: '#A64339',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#A84339',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
