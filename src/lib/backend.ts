import { appConfig } from '@/env';
import { supabase } from '@/lib/supabase';

const backendBaseUrl = appConfig.backendUrl.replace(/\/$/, '');
const accountRequestTimeoutMs = 30_000;

export const buildBackendUrl = (path: string) => `${backendBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;

const postBackendJson = async (path: string, body: Record<string, unknown>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), accountRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(buildBackendUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        'The account server did not respond within 30 seconds. Check that it is running, your phone and computer are connected, and EXPO_PUBLIC_BACKEND_URL uses your computer’s current hotspot IP. Allow port 3000 through the firewall, then restart Expo.',
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Cannot reach the account server. Start it with "npm run server". On a phone, set EXPO_PUBLIC_BACKEND_URL in the project .env to your computer’s current hotspot IP (for example, http://192.168.137.1:3000), allow port 3000 through the firewall, and restart Expo.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let payload: { ok?: boolean; error?: string; [key: string]: unknown } | null = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    if (response.status === 404 && path === '/api/auth/signup') {
      throw new Error('The account server is running an older version. Stop it and restart with "npm run server", then try again.');
    }
    throw new Error(`The account server returned an unreadable response (HTTP ${response.status}). Restart it with "npm run server" and try again.`);
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Unable to contact the account service');
  }
  return payload;
};

export const createBackendAccount = async (account: {
  email: string;
  password: string;
  fullName: string;
  role: 'user' | 'vendor';
  businessName?: string;
  termsVersion?: string;
  planId?: 'free' | 'pro';
}): Promise<{ userId: string; otpLength: number; expiresInSeconds: number }> => {
  const payload = await postBackendJson('/api/auth/signup', account);
  if (
    typeof payload.userId !== 'string'
    || typeof payload.otpLength !== 'number'
    || !Number.isSafeInteger(payload.otpLength)
    || payload.otpLength < 1
    || typeof payload.expiresInSeconds !== 'number'
    || !Number.isSafeInteger(payload.expiresInSeconds)
    || payload.expiresInSeconds <= 0
  ) {
    throw new Error('The account service returned invalid verification details');
  }
  return {
    userId: payload.userId,
    otpLength: payload.otpLength,
    expiresInSeconds: payload.expiresInSeconds,
  };
};

export const resendBackendSignupOtp = async (
  email: string,
  userId: string,
): Promise<{ verificationType: 'signup' | 'magiclink'; otpLength: number; expiresInSeconds: number }> => {
  const payload = await postBackendJson('/api/auth/resend-signup-otp', { email, userId });
  const verificationType = payload.verificationType;
  if (
    (verificationType === 'signup' || verificationType === 'magiclink')
    && typeof payload.otpLength === 'number'
    && Number.isSafeInteger(payload.otpLength)
    && payload.otpLength > 0
    && typeof payload.expiresInSeconds === 'number'
    && Number.isSafeInteger(payload.expiresInSeconds)
    && payload.expiresInSeconds > 0
  ) {
    return {
      verificationType,
      otpLength: payload.otpLength,
      expiresInSeconds: payload.expiresInSeconds,
    };
  }
  throw new Error('The account service returned invalid verification details');
};

const getAuthorizationHeaders = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error('Sign in is required to access this service.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.session.access_token}`,
  };
};

export const sendVendorDecisionEmail = async (
  vendorId: string,
  status: 'approved' | 'rejected',
): Promise<void> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), accountRequestTimeoutMs);
  let response: Response;

  try {
    response = await fetch(buildBackendUrl('/api/admin/vendors/decision-email'), {
      method: 'POST',
      headers: await getAuthorizationHeaders(),
      body: JSON.stringify({ vendorId, status }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The account server did not respond within 30 seconds. The vendor decision was saved; retry sending the email.');
    }
    if (error instanceof TypeError) {
      throw new Error('Cannot reach the account server. The vendor decision was saved; check the server connection and retry sending the email.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let payload: { sent?: boolean; error?: string } = {};
  try {
    payload = responseText ? JSON.parse(responseText) as { sent?: boolean; error?: string } : {};
  } catch {
    throw new Error(`The account server returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok || payload.sent !== true) {
    throw new Error(payload.error || `The account server could not send the decision email (HTTP ${response.status}).`);
  }
};

type PaymentResponse = {
  success?: boolean;
  error?: string;
  reference?: string;
  authorization_url?: string;
  amount?: number;
  currency?: string;
  status?: string;
  data?: { status?: string };
  [key: string]: unknown;
};

const postPaymentRequest = async (
  path: string,
  body: Record<string, unknown>,
): Promise<PaymentResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(buildBackendUrl(path), {
      method: 'POST',
      headers: await getAuthorizationHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The payment server did not respond within 15 seconds. Check that it is running and reachable, then try Pay now again.');
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Cannot reach the payment server. Start it with "npm run server". If you are using a physical phone, set EXPO_PUBLIC_BACKEND_URL to your computer’s LAN address (for example http://192.168.1.10:3000), allow port 3000 through the firewall, then restart Expo. Your booking is saved; return to its details and tap Pay now to retry.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let payload: PaymentResponse;
  try {
    payload = responseText ? JSON.parse(responseText) as PaymentResponse : {};
  } catch {
    throw new Error(`The payment server returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(payload.error || `The payment server returned HTTP ${response.status}.`);
  }
  return payload;
};

export const createBackendPayment = async ({ bookingId }: { bookingId: string }) => {
  const payload = await postPaymentRequest('/api/payments/create', { bookingId });

  if (!payload.success) {
    throw new Error(payload?.error || 'Unable to initialize payment');
  }

  return payload as {
    success: true;
    reference: string;
    authorization_url: string;
    amount: number;
    currency: string;
  };
};

export const createBackendVendorUpgrade = async () => {
  const payload = await postPaymentRequest('/api/vendor/upgrade', {});
  if (!payload.success || typeof payload.reference !== 'string' || typeof payload.authorization_url !== 'string') {
    throw new Error(payload.error || 'Unable to initialize the PRO upgrade');
  }
  return {
    reference: payload.reference,
    authorization_url: payload.authorization_url,
  };
};

export const verifyBackendPayment = async (reference: string) => {
  const payload = await postPaymentRequest('/api/payments/verify', { reference });

  if (!payload?.success) {
    throw new Error(payload?.error || 'Unable to verify payment');
  }

  return payload;
};

export const verifyBackendVendorUpgrade = async (reference: string) => {
  const payload = await postPaymentRequest('/api/vendor/upgrade/verify', { reference });
  if (!payload.success) {
    throw new Error(payload.error || 'Unable to verify the PRO upgrade');
  }
  return payload;
};
