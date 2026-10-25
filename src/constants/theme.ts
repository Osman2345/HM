export const theme = {
  colors: {
    background: '#F8FAFC',
    foreground: '#0F172A',
    muted: '#64748B',
    card: '#FFFFFF',
    border: '#E2E8F0',
    primary: '#2563EB',
    primarySoft: '#DBEAFE',
    success: '#16A34A',
    warning: '#F59E0B',
    danger: '#DC2626',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  typography: {
    title: 24,
    section: 18,
    body: 14,
    caption: 12,
  },
} as const;

export type AppTheme = typeof theme;
export default theme;
