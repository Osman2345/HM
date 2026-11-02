import Constants from 'expo-constants';

const expoHost = Constants.expoConfig?.hostUri
  ?.replace(/^(?:https?|exp):\/\//i, '')
  .replace(/:\d+$/, '');
const defaultBackendUrl = __DEV__ && expoHost
  ? `http://${expoHost.includes(':') && !expoHost.startsWith('[') ? `[${expoHost}]` : expoHost}:3000`
  : 'http://localhost:3000';

export const appConfig = {
  appName: 'Hotel Management',
  backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL || defaultBackendUrl,
} as const;
