import { Ionicons } from '@expo/vector-icons';
import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAuthStore } from '@/store/auth.store';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface NavigationItem {
  label: string;
  href: Href;
  icon: IconName;
}

interface RoleSidebarLayoutProps {
  brand: string;
  description: string;
  items: readonly NavigationItem[];
  showSignOut?: boolean;
}

const adminItems = [
  { label: 'Overview', href: '/(admin)/dashboard', icon: 'grid-outline' },
  { label: 'Bookings', href: '/(admin)/bookings', icon: 'calendar-outline' },
  { label: 'Hotels', href: '/(admin)/hotels', icon: 'business-outline' },
  { label: 'Vendors', href: '/(admin)/vendors', icon: 'briefcase-outline' },
  { label: 'Users', href: '/(admin)/users', icon: 'people-outline' },
  { label: 'Payouts', href: '/(admin)/payouts', icon: 'wallet-outline' },
  { label: 'Reports', href: '/(admin)/reports', icon: 'bar-chart-outline' },
] as const satisfies readonly NavigationItem[];

const vendorItems = [
  { label: 'Dashboard', href: '/(vendor)/dashboard', icon: 'grid-outline' },
  { label: 'Rooms', href: '/(vendor)/hotels', icon: 'business-outline' },
  { label: 'Bookings', href: '/(vendor)/bookings', icon: 'calendar-outline' },
  { label: 'Earnings', href: '/(vendor)/payouts', icon: 'wallet-outline' },
  { label: 'Settings', href: '/(vendor)/profile', icon: 'person-outline' },
] as const satisfies readonly NavigationItem[];

export function AdminSidebarLayout() {
  return (
    <RoleSidebarLayout
      brand="SL STAY"
      description="ADMINISTRATION"
      items={adminItems}
    />
  );
}

export function VendorSidebarLayout() {
  return (
    <RoleSidebarLayout
      brand="SL STAY"
      description="PARTNER PORTAL"
      items={vendorItems}
      showSignOut
    />
  );
}

function RoleSidebarLayout({ brand, description, items, showSignOut = false }: RoleSidebarLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOut = useAuthStore((state) => state.signOut);
  const wideLayout = width >= 769;
  const showSignOutLabel = width >= 520;
  const activeItem = items.find((item) => pathname.endsWith(item.href.toString().split('/').pop() ?? ''));
  const pageTitle = activeItem?.label ?? 'Dashboard';

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

  const navigation = (
    <Sidebar
      brand={brand}
      description={description}
      items={items}
      pathname={pathname}
      onNavigate={(href) => {
        setDrawerOpen(false);
        router.push(href);
      }}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shell}>
        {wideLayout ? navigation : null}
        <View style={styles.main}>
          <View style={styles.topbar}>
            {!wideLayout ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open navigation menu"
                style={styles.menuButton}
                onPress={() => setDrawerOpen(true)}
              >
                <Ionicons name="menu-outline" size={23} color="#17354B" />
              </TouchableOpacity>
            ) : null}
            <View style={styles.topbarTitles}>
              <Text style={styles.topbarTitle}>{pageTitle}</Text>
              <Text style={styles.topbarSubtitle}>{description}</Text>
            </View>
            {showSignOut ? (
              <TouchableOpacity
                style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
                onPress={() => void handleSignOut()}
                disabled={signingOut}
                accessibilityRole="button"
                accessibilityLabel={signingOut ? 'Signing out' : 'Sign out'}
                accessibilityState={{ disabled: signingOut, busy: signingOut }}
              >
                {signingOut
                  ? <ActivityIndicator size="small" color="#B42318" />
                  : <Ionicons name="log-out-outline" size={18} color="#B42318" />}
                {showSignOutLabel ? (
                  <Text style={styles.signOutButtonText}>
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ) : null}
            <View style={styles.portalBadge}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#087E8B" />
              <Text style={styles.portalBadgeText}>{description === 'ADMINISTRATION' ? 'Admin' : 'Partner'}</Text>
            </View>
          </View>
          {signOutError ? (
            <Text accessibilityRole="alert" style={styles.signOutError}>{signOutError}</Text>
          ) : null}
          <View style={styles.content}>
            <Slot />
          </View>
          <View style={styles.mainFooter}>
            <Text style={styles.mainFooterText}>Copyright © 2026 SL Stay</Text>
          </View>
        </View>
      </View>
      {!wideLayout ? (
        <Modal
          visible={drawerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDrawerOpen(false)}
        >
          <View style={styles.drawerOverlay}>
            <Pressable style={styles.scrim} onPress={() => setDrawerOpen(false)} />
            <View style={styles.drawer}>{navigation}</View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

interface SidebarProps {
  brand: string;
  description: string;
  items: readonly NavigationItem[];
  pathname: string;
  onNavigate: (href: Href) => void;
}

function Sidebar({ brand, description, items, pathname, onNavigate }: SidebarProps) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.brandBlock}>
        <View style={styles.brandMark}>
          <Ionicons name="bed" size={19} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.brandName}>{brand}</Text>
          <Text style={styles.brandDescription}>{description}</Text>
        </View>
      </View>
      <Text style={styles.navCaption}>WORKSPACE</Text>
      <ScrollView contentContainerStyle={styles.navigation}>
        {items.map((item) => {
          const selected = pathname.endsWith(item.href.toString().split('/').pop() ?? '');
          return (
            <TouchableOpacity
              key={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onNavigate(item.href)}
              style={[styles.navItem, selected && styles.navItemSelected]}
            >
              <Ionicons
                name={item.icon}
                size={19}
                color={selected ? '#FFFFFF' : '#8FA4B2'}
              />
              <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>
                {item.label}
              </Text>
              {selected ? <View style={styles.activeMark} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.sidebarFooter}>
        <View style={styles.footerMark}><Ionicons name="lock-closed-outline" size={15} color="#B7CCD4" /></View>
        <View style={styles.footerCopy}>
          <Text style={styles.footerTitle}>SL Stay secure</Text>
          <Text style={styles.footerSubtitle}>Private workspace</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7F8',
    paddingTop: Platform.OS === 'android' ? 0 : undefined,
  },
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F4F7F8',
  },
  sidebar: {
    width: 258,
    backgroundColor: '#112D3C',
    paddingHorizontal: 17,
    paddingTop: 22,
    paddingBottom: 14,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 7,
    paddingBottom: 30,
  },
  brandMark: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandDescription: {
    color: '#91AAB6',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 3,
  },
  navCaption: {
    color: '#78919E',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 11,
    paddingHorizontal: 10,
  },
  navigation: {
    gap: 5,
  },
  navItem: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 11,
    borderRadius: 10,
  },
  navItemSelected: {
    backgroundColor: '#087E8B',
  },
  navLabel: {
    flex: 1,
    color: '#B7C8D0',
    fontSize: 13,
    fontWeight: '600',
  },
  navLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  activeMark: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#B5ECE5',
  },
  sidebarFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: '#294653',
    paddingTop: 16,
    paddingHorizontal: 6,
  },
  footerMark: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4050',
  },
  footerCopy: {
    flex: 1,
  },
  footerTitle: {
    color: '#E7F0F2',
    fontSize: 11,
    fontWeight: '700',
  },
  footerSubtitle: {
    color: '#90A8B3',
    fontSize: 10,
    marginTop: 3,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  topbar: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EEF0',
  },
  menuButton: {
    width: 39,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#F1F6F6',
  },
  topbarTitles: {
    flex: 1,
  },
  topbarTitle: {
    color: '#17354B',
    fontSize: 16,
    fontWeight: '800',
  },
  topbarSubtitle: {
    color: '#82939D',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 3,
  },
  portalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: '#EAF5F4',
  },
  portalBadgeText: {
    color: '#087E8B',
    fontSize: 11,
    fontWeight: '800',
  },
  signOutButton: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#FEF3F2',
  },
  signOutButtonText: {
    color: '#B42318',
    fontSize: 12,
    fontWeight: '700',
  },
  signOutButtonDisabled: {
    opacity: 0.65,
  },
  signOutError: {
    color: '#B42318',
    backgroundColor: '#FEF3F2',
    paddingHorizontal: 24,
    paddingVertical: 8,
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  mainFooter: {
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#E8EEF0',
    backgroundColor: '#FFFFFF',
  },
  mainFooterText: {
    color: '#82939D',
    fontSize: 10,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(7, 25, 34, 0.42)',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  drawer: {
    width: 280,
    height: '100%',
  },
});
