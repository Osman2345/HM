import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig = (config ?? {}) as ExpoConfig;

  return {
    ...baseConfig,
    name: 'SL Stay',
    slug: baseConfig.slug ?? 'hotel-management',
    scheme: 'hotelmanagement',
    extra: {
      ...(baseConfig.extra ?? {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      googleMapsEmbedKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? '',
      backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:3000',
    },
  };
};
