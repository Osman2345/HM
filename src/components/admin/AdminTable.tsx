import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

export function AdminTable({ children, minWidth }: { children: ReactNode; minWidth: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scrollContent}>
      <View style={[styles.table, { minWidth }]}>{children}</View>
    </ScrollView>
  );
}

export function AdminTableHeader({ children }: { children: ReactNode }) {
  return <View style={styles.headerRow}>{children}</View>;
}

export function AdminTableRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function AdminTableCell({
  children,
  width,
  style,
}: {
  children: ReactNode;
  width: number;
  style?: ViewStyle;
}) {
  return <View style={[styles.cell, { width }, style]}>{children}</View>;
}

export const adminTableText = StyleSheet.create({
  header: { color: '#64748B', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  primary: { color: '#1F2937', fontSize: 12, fontWeight: '800' },
  secondary: { marginTop: 3, color: '#64748B', fontSize: 11 },
  muted: { color: '#6B7280', fontSize: 11 },
});

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  table: { overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, backgroundColor: '#FFFFFF' },
  headerRow: { minHeight: 39, flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#F3F4F6', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  cell: { minHeight: 58, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRightWidth: 1, borderRightColor: '#F3F4F6' },
});