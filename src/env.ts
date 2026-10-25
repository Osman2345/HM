export const appConfig = {
  appName: 'Hotel Management',
  backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:3000',
} as const;
