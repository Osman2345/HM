import { Ionicons } from '@expo/vector-icons';
import { Link, Tabs, usePathname } from 'expo-router';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth.store';

const footerPages = [
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
] as const;

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const session = useAuthStore((state) => state.session);
  const desktopWeb = Platform.OS === 'web' && width >= 769;

  return (
    <View style={styles.layout}>
      {desktopWeb ? (
        <View style={styles.webHeader}>
          <View style={styles.webHeaderContent}>
            <Link href="/(tabs)" asChild>
              <TouchableOpacity style={styles.webHeaderBrand} accessibilityRole="link">
                <Text style={styles.webHeaderBrandText}>SL <Text style={styles.webHeaderBrandAccent}>STAY</Text></Text>
              </TouchableOpacity>
            </Link>
            <Link href="/(tabs)/search" asChild>
              <TouchableOpacity style={styles.webSearchLink} accessibilityRole="link">
                <Ionicons name="search" size={18} color="#4B5563" />
                <Text style={styles.webSearchText}>Search stays and destinations</Text>
              </TouchableOpacity>
            </Link>
            <View style={styles.accountActions}>
              <Link href="/notifications" asChild>
                <TouchableOpacity style={styles.notificationLink} accessibilityRole="link" accessibilityLabel="Notifications">
                  <Ionicons name="notifications-outline" size={19} color="#1F2937" />
                </TouchableOpacity>
              </Link>
              <View style={styles.accountLinks}>
                <Link href={session ? '/(tabs)/profile' : '/login'} asChild>
                  <TouchableOpacity style={styles.accountLink} accessibilityRole="link">
                    <Ionicons name="person-outline" size={18} color="#4B5563" />
                    <Text style={styles.accountLinkText}>{session ? 'Account' : 'Login'}</Text>
                  </TouchableOpacity>
                </Link>
                <Link href="/login?audience=vendor" asChild>
                  <TouchableOpacity style={styles.listPropertyLink} accessibilityRole="link">
                    <Text style={styles.listPropertyText}>List your property</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </View>
          <View style={styles.webNavigation}>
            <View style={styles.webNavigationLinks}>
              <Link href="/(tabs)" asChild>
                <TouchableOpacity
                  accessibilityRole="link"
                  accessibilityState={{ selected: pathname === '/' || pathname === '/(tabs)' }}
                  style={pathname === '/' || pathname === '/(tabs)' ? styles.webNavigationLinkActive : styles.webNavigationLink}
                >
                  <Text style={pathname === '/' || pathname === '/(tabs)' ? styles.webNavigationTextActive : styles.webNavigationText}>Home</Text>
                </TouchableOpacity>
              </Link>
              <Link href="/(tabs)/search" asChild>
                <TouchableOpacity
                  accessibilityRole="link"
                  accessibilityState={{ selected: pathname.endsWith('/search') }}
                  style={pathname.endsWith('/search') ? styles.webNavigationLinkActive : styles.webNavigationLink}
                >
                  <Text style={pathname.endsWith('/search') ? styles.webNavigationTextActive : styles.webNavigationText}>Search</Text>
                </TouchableOpacity>
              </Link>
              <Link href="/(tabs)/favorites" asChild>
                <TouchableOpacity
                  accessibilityRole="link"
                  accessibilityState={{ selected: pathname.endsWith('/favorites') }}
                  style={pathname.endsWith('/favorites') ? styles.webNavigationLinkActive : styles.webNavigationLink}
                >
                  <Text style={pathname.endsWith('/favorites') ? styles.webNavigationTextActive : styles.webNavigationText}>Saved</Text>
                </TouchableOpacity>
              </Link>
              <Link href="/(tabs)/bookings" asChild>
                <TouchableOpacity
                  accessibilityRole="link"
                  accessibilityState={{ selected: pathname.endsWith('/bookings') }}
                  style={pathname.endsWith('/bookings') ? styles.webNavigationLinkActive : styles.webNavigationLink}
                >
                  <Text style={pathname.endsWith('/bookings') ? styles.webNavigationTextActive : styles.webNavigationText}>Bookings</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      ) : null}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#4B5563',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: StyleSheet.flatten([
            styles.tabBar,
            {
              display: desktopWeb ? 'none' : 'flex',
              height: 61 + insets.bottom,
              paddingBottom: Math.max(insets.bottom, 5),
            },
          ]),
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarIconStyle: styles.tabBarIcon,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={focused ? '#4B5563' : '#9CA3AF'} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ size, focused }) => <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={focused ? '#4B5563' : '#9CA3AF'} />,
          }}
        />
        <Tabs.Screen name="favorites" options={{ href: desktopWeb ? '/(tabs)/favorites' : null }} />
        <Tabs.Screen
          name="bookings"
          options={{
            title: 'Bookings',
            tabBarIcon: ({ size, focused }) => <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={focused ? '#4B5563' : '#9CA3AF'} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Account',
            tabBarIcon: ({ size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={focused ? '#4B5563' : '#9CA3AF'} />,
          }}
        />
      </Tabs>
      {desktopWeb ? (
        <View style={styles.webFooter}>
          <View style={styles.webFooterContent}>
            <View style={styles.footerLinks}>
              {footerPages.map((page) => (
                <Link key={page.label} href={page.href} asChild>
                  <TouchableOpacity accessibilityRole="link" style={styles.footerLinkButton}>
                    <Text style={styles.footerLink}>{page.label}</Text>
                  </TouchableOpacity>
                </Link>
              ))}
            </View>
            <View style={styles.footerBottom}>
              <Text style={styles.footerSocials}>Instagram  ·  Facebook  ·  X</Text>
              <Text style={styles.footerCopyright}>Copyright © 2026 SL Stay. All rights reserved.</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  webHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E6EBEC',
    zIndex: 1,
  },
  webHeaderContent: {
    width: '100%',
    maxWidth: 1280,
    minHeight: 76,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
    paddingHorizontal: 28,
  },
  webHeaderBrand: {
    flexShrink: 0,
    paddingVertical: 10,
  },
  webHeaderBrandText: {
    color: '#1F2937',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  webHeaderBrandAccent: {
    color: '#4B5563',
  },
  webSearchLink: {
    flex: 1,
    maxWidth: 480,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DCE6E7',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  webSearchText: {
    color: '#64748B',
    fontSize: 13,
  },
  accountLink: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  accountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountLinks: {
    alignItems: 'flex-end',
    gap: 4,
  },
  notificationLink: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  accountLinkText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '700',
  },
  listPropertyLink: {
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  listPropertyText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  webNavigation: {
    width: '100%',
    maxWidth: 1280,
    minHeight: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 24,
    paddingHorizontal: 28,
    borderTopWidth: 1,
    borderTopColor: '#F0F3F4',
    borderBottomWidth: 1,
    borderBottomColor: '#E6EBEC',
  },
  webNavigationLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webNavigationLink: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  webNavigationLinkActive: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  webNavigationText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  webNavigationTextActive: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '800',
  },
  tabBar: {
    paddingTop: 7,
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E6EBEC',
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  tabBarIcon: {
    marginBottom: 1,
  },
  webFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E6EBEC',
  },
  webFooterContent: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 20,
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6EBEC',
  },
  footerLinkButton: {
    paddingVertical: 4,
  },
  footerLink: {
    color: '#415666',
    fontSize: 12,
    fontWeight: '600',
  },
  footerBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 14,
  },
  footerSocials: {
    color: '#64748B',
    fontSize: 11,
  },
  footerCopyright: {
    color: '#9CA3AF',
    fontSize: 11,
  },
});
