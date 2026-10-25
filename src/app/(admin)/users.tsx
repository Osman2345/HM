import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { loadAdminUsers, updateAdminUser, type AdminUser } from '@/services/admin';
import type { UserRole } from '@/types/database';

const roles: UserRole[] = ['user', 'vendor', 'admin'];

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
    >
      <Text style={styles.heading}>User management</Text>
      <TextInput
        accessibilityLabel="Search users"
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name or email"
        autoCapitalize="none"
        style={styles.search}
      />
      {loading ? <Text style={styles.state}>Loading users…</Text> : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => void refresh()}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && users.length === 0 ? <Text style={styles.state}>No users match this search.</Text> : null}
      {users.map((user) => (
        <View key={user.id} style={styles.card}>
          <Text style={styles.name}>{user.fullname || 'Name not provided'}</Text>
          <Text style={styles.meta}>{user.email}</Text>
          <Text style={styles.meta}>Account: {user.disabled ? 'disabled' : 'enabled'}</Text>
          <Text style={styles.label}>Role — managed through the admin RPC</Text>
          <View style={styles.roles}>
            {roles.map((role) => (
              <TouchableOpacity
                key={role}
                accessibilityRole="button"
                accessibilityState={{ selected: user.role === role }}
                disabled={busyId === user.id || user.role === role}
                style={[styles.roleButton, user.role === role && styles.roleSelected]}
                onPress={() => void updateUser(user, { role })}
              >
                <Text style={[styles.roleText, user.role === role && styles.roleTextSelected]}>{role}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busyId === user.id}
            style={user.disabled ? styles.primary : styles.secondary}
            onPress={() => void updateUser(user, { disabled: !user.disabled })}
          >
            <Text style={user.disabled ? styles.buttonText : styles.secondaryText}>
              {busyId === user.id ? 'Saving…' : user.disabled ? 'Enable account' : 'Disable account'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  search: { minHeight: 46, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  state: { color: '#475569', paddingVertical: 16 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#FEF2F2' },
  error: { color: '#B91C1C' },
  card: { padding: 14, gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12 },
  name: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  meta: { color: '#475569' },
  label: { color: '#334155', fontWeight: '600' },
  roles: { flexDirection: 'row', gap: 8 },
  roleButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 9 },
  roleSelected: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  roleText: { color: '#334155', textTransform: 'capitalize' },
  roleTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  primary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#15803D' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#B91C1C' },
  secondaryText: { color: '#B91C1C', fontWeight: '700' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
