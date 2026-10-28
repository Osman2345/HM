import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useAuthStore } from '@/store/auth.store';

export default function ProfileScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktopWeb = Platform.OS === 'web' && width >= 769;
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const profile = useAuthStore((state: {
    profile: {
      fullname: string | null;
      email: string | null;
      role: string;
      vendor_status: string | null;
    } | null;
  }) => state.profile);
  const signOut = useAuthStore((state: { signOut: () => Promise<void> }) => state.signOut);
  const name = profile?.fullname?.trim() || 'traveller';
  const initials = profile?.fullname
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SL';

  const handleSignOut = async () => {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (caughtError) {
      setSignOutError(caughtError instanceof Error ? caughtError.message : 'Unable to sign out.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={[styles.heroTopRow, desktopWeb && styles.desktopHidden]}>
          <View style={styles.brand}>
            <View style={styles.brandMark}><Ionicons name="bed" size={17} color="#FFFFFF" /></View>
            <Text style={styles.brandName}>SL <Text style={styles.brandAccent}>STAY</Text></Text>
          </View>
          <TouchableOpacity
            style={styles.heroIconButton}
            onPress={() => router.push('/notifications')}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
          >
            <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.accountSummary}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.accountDetails}>
            <Text style={styles.greeting}>Hi, {name}</Text>
            <Text style={styles.memberLabel}>
              {profile ? 'SL Stay traveller' : 'Sign in to manage your stays'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color="#BBD0D9" />
        </View>
      </View>

      {profile?.email ? (
        <View style={styles.emailCard}>
          <Ionicons name="mail-outline" size={18} color="#087E8B" />
          <Text style={styles.email} numberOfLines={1}>{profile.email}</Text>
        </View>
      ) : null}

      <MenuSection title="YOUR TRAVEL" rows={[
        { title: 'Saved stays', icon: 'heart-outline', href: '/(tabs)/favorites' },
        { title: 'My bookings', icon: 'calendar-outline', href: '/(tabs)/bookings' },
        { title: 'Notifications', icon: 'notifications-outline', href: '/notifications' },
      ]} />

      <MenuSection title="YOUR ACCOUNT" rows={[
        ...(profile
          ? [{ title: 'Email address', icon: 'person-outline' as const, detail: profile.email ?? 'Not provided' }]
          : [{ title: 'Sign in or create an account', icon: 'person-outline' as const, onPress: () => router.push('/login') }]),
        ...(profile?.role === 'admin'
          ? [{ title: 'Admin workspace', icon: 'grid-outline' as const, onPress: () => router.push('/(admin)/dashboard') }]
          : []),
        ...(profile?.role === 'vendor' && profile.vendor_status === 'approved'
          ? [{ title: 'Partner workspace', icon: 'business-outline' as const, onPress: () => router.push('/(vendor)/dashboard') }]
          : []),
      ]} />

      {profile ? (
        <>
          {signOutError ? <Text style={styles.signOutError}>{signOutError}</Text> : null}
          <TouchableOpacity
            style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
            onPress={() => void handleSignOut()}
            disabled={signingOut}
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={18} color="#B42318" />
            <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerBrand}>SL STAY</Text>
        <Text style={styles.footerCaption}>Stay local. Feel at home.</Text>
      </View>
    </ScrollView>
  );
}

type MenuRow = {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  href?: '/(tabs)/favorites' | '/(tabs)/bookings' | '/notifications';
  detail?: string;
  onPress?: () => void;
};

function MenuSection({ title, rows }: { title: string; rows: MenuRow[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{title}</Text>
      <View style={styles.menuCard}>
        {rows.map((row, index) => {
          const content = (
            <>
              <View style={styles.rowIcon}><Ionicons name={row.icon} size={18} color="#425E70" /></View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={17} color="#9BA9B1" />
            </>
          );
          const rowStyle = StyleSheet.flatten([
            styles.menuRow,
            index < rows.length - 1 ? styles.menuRowDivider : null,
          ]);

          if (row.href) {
            return (
              <Link key={row.title} href={row.href} asChild>
                <TouchableOpacity style={rowStyle} activeOpacity={0.75}>{content}</TouchableOpacity>
              </Link>
            );
          }

          return (
            <TouchableOpacity key={row.title} style={rowStyle} onPress={row.onPress} disabled={!row.onPress} activeOpacity={0.75}>
              {content}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingBottom: 28,
    backgroundColor: '#F5F6F7',
  },
  hero: {
    paddingTop: 17,
    paddingHorizontal: 19,
    paddingBottom: 20,
    backgroundColor: '#123A50',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  desktopHidden: {
    display: 'none',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: '#087E8B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  brandAccent: {
    color: '#F2B544',
  },
  heroIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#547182',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountSummary: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: '#F2B544',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFE3A5',
  },
  avatarText: {
    color: '#17354B',
    fontSize: 16,
    fontWeight: '800',
  },
  accountDetails: {
    flex: 1,
    marginLeft: 12,
  },
  greeting: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  memberLabel: {
    marginTop: 3,
    color: '#D4E2E6',
    fontSize: 12,
  },
  emailCard: {
    marginTop: 13,
    marginHorizontal: 17,
    paddingHorizontal: 14,
    minHeight: 45,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  email: {
    flex: 1,
    color: '#536674',
    fontSize: 13,
  },
  section: {
    marginTop: 20,
  },
  sectionHeading: {
    marginHorizontal: 20,
    marginBottom: 8,
    color: '#415462',
    fontSize: 12,
    fontWeight: '800',
  },
  menuCard: {
    marginHorizontal: 16,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  menuRow: {
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  menuRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECEE',
  },
  rowIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: '#F0F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#263F50',
    fontSize: 13,
    fontWeight: '600',
  },
  rowDetail: {
    marginTop: 2,
    color: '#7E8C95',
    fontSize: 11,
  },
  signOutButton: {
    marginHorizontal: 16,
    marginTop: 18,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0D6D3',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signOutText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
  },
  signOutError: {
    marginHorizontal: 20,
    marginTop: 12,
    color: '#B42318',
    fontSize: 12,
    textAlign: 'center',
  },
  signOutButtonDisabled: {
    opacity: 0.6,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerBrand: {
    color: '#087E8B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  footerCaption: {
    marginTop: 4,
    color: '#86939B',
    fontSize: 11,
  },
});
