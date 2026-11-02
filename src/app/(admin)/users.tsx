import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { loadAdminUsers, updateAdminUser, type AdminUser } from '@/services/admin';
import { AdminTable, AdminTableCell, AdminTableHeader, AdminTableRow, adminTableText } from '@/components/admin/AdminTable';
import type { UserRole } from '@/types/database';

const roles: UserRole[] = ['user', 'vendor', 'admin'];
const roleFilters: Array<'all' | UserRole> = ['all', 'user', 'vendor', 'admin'];

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setUsers(await loadAdminUsers(search));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), search ? 250 : 0);
    return () => clearTimeout(timeout);
  }, [refresh, search]);

  const updateUser = async (user: AdminUser, values: { role?: UserRole; disabled?: boolean }) => {
    setBusyId(user.id);
    setError(null);
    try {
      await updateAdminUser(user.id, values);
      await refresh(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update this account.');
    } finally {
      setBusyId(null);
    }
  };

  const visibleUsers = users.filter((user) => roleFilter === 'all' || user.role === roleFilter);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <View style={styles.pageHeading}>
        <View><Text style={styles.heading}>User management</Text><Text style={styles.subtitle}>{visibleUsers.length} matching accounts</Text></View>
      </View>
      <View style={styles.toolbar}>
        <TextInput
          accessibilityLabel="Search users"
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, email or business"
          autoCapitalize="none"
          style={styles.search}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {roleFilters.map((role) => (
            <TouchableOpacity
              key={role}
              accessibilityRole="button"
              accessibilityState={{ selected: roleFilter === role }}
              style={[styles.filterButton, roleFilter === role && styles.filterButtonSelected]}
              onPress={() => setRoleFilter(role)}
            >
              <Text style={[styles.filterText, roleFilter === role && styles.filterTextSelected]}>{role === 'all' ? 'All roles' : role}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {loading ? <Text style={styles.state}>Loading users…</Text> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => void refresh()}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && visibleUsers.length === 0 ? <Text style={styles.state}>No users match these filters.</Text> : null}
      {!loading && !error && visibleUsers.length ? (
        <AdminTable minWidth={1050}>
          <AdminTableHeader>
            <AdminTableCell width={260}><Text style={adminTableText.header}>User</Text></AdminTableCell>
            <AdminTableCell width={100}><Text style={adminTableText.header}>Role</Text></AdminTableCell>
            <AdminTableCell width={110}><Text style={adminTableText.header}>Account</Text></AdminTableCell>
            <AdminTableCell width={190}><Text style={adminTableText.header}>Risk</Text></AdminTableCell>
            <AdminTableCell width={390}><Text style={adminTableText.header}>Manage</Text></AdminTableCell>
          </AdminTableHeader>
          {visibleUsers.map((user) => (
            <AdminTableRow key={user.id}>
              <AdminTableCell width={260}>
                <Text numberOfLines={1} style={adminTableText.primary}>{user.fullname || 'Name not provided'}</Text>
                <Text numberOfLines={1} style={adminTableText.secondary}>{user.email}</Text>
              </AdminTableCell>
              <AdminTableCell width={100}><Text style={[styles.roleBadge, styles.roleBadgeUser]}>{user.role}</Text></AdminTableCell>
              <AdminTableCell width={110}><Text style={[styles.statusBadge, user.disabled ? styles.statusDisabled : styles.statusActive]}>{user.disabled ? 'Suspended' : 'Active'}</Text></AdminTableCell>
              <AdminTableCell width={190}>
                {user.booking_risk_flagged_at
                  ? <Text numberOfLines={2} style={styles.riskFlag}>Repeat no-show · {user.no_show_count}</Text>
                  : <Text style={adminTableText.muted}>No flags</Text>}
              </AdminTableCell>
              <AdminTableCell width={390}>
                <View style={styles.actionGroup}>
                  {roles.filter((role) => role !== user.role).map((role) => (
                    <TouchableOpacity
                      key={role}
                      accessibilityRole="button"
                      disabled={busyId === user.id}
                      style={styles.smallAction}
                      onPress={() => void updateUser(user, { role })}
                    >
                      <Text style={styles.smallActionText}>Set {role}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={busyId === user.id}
                    style={[styles.smallAction, user.disabled ? styles.enableAction : styles.suspendAction]}
                    onPress={() => void updateUser(user, { disabled: !user.disabled })}
                  >
                    <Text style={[styles.smallActionText, user.disabled ? styles.enableActionText : styles.suspendActionText]}>
                      {busyId === user.id ? 'Saving…' : user.disabled ? 'Enable' : 'Suspend'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </AdminTable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 36, gap: 14 },
  pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 23, fontWeight: '800', color: '#17354B' },
  subtitle: { marginTop: 4, color: '#718397', fontSize: 12 },
  toolbar: { gap: 10 },
  search: { minHeight: 42, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', color: '#17354B' },
  filters: { gap: 7, paddingVertical: 1 },
  filterButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: '#DDE6E9', borderRadius: 6, backgroundColor: '#FFFFFF' },
  filterButtonSelected: { borderColor: '#087E8B', backgroundColor: '#E8F5F3' },
  filterText: { color: '#526974', fontSize: 11, textTransform: 'capitalize', fontWeight: '600' },
  filterTextSelected: { color: '#087E8B', fontWeight: '800' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 7, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C', fontSize: 12 },
  primary: { minHeight: 34, marginTop: 8, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#087E8B' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  roleBadge: { alignSelf: 'flex-start', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, color: '#075E64', backgroundColor: '#E8F5F3', fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  roleBadgeUser: { color: '#526974' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, fontSize: 10, fontWeight: '800' },
  statusActive: { color: '#027A48', backgroundColor: '#ECFDF3' },
  statusDisabled: { color: '#B42318', backgroundColor: '#FEF3F2' },
  riskFlag: { color: '#B42318', fontSize: 11, fontWeight: '800' },
  actionGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  smallAction: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: '#B9DCDD', borderRadius: 5, backgroundColor: '#FFFFFF' },
  smallActionText: { color: '#087E8B', fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  suspendAction: { borderColor: '#FECACA', backgroundColor: '#FEF3F2' },
  suspendActionText: { color: '#B42318' },
  enableAction: { borderColor: '#A6F4C5', backgroundColor: '#ECFDF3' },
  enableActionText: { color: '#027A48' },
});
