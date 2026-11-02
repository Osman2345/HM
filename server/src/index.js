/* global __dirname, Buffer */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,exp://localhost:8081,http://127.0.0.1:8081')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const isPrivateDevelopmentOrigin = (origin) => {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname;
    return host === 'localhost'
      || host === '127.0.0.1'
      || /^10(?:\.\d{1,3}){3}$/.test(host)
      || /^192\.168(?:\.\d{1,3}){2}$/.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host);
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || isPrivateDevelopmentOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  }),
);

app.use('/api/payments/monime-webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

const authEmailCooldowns = new Map();
const authEmailCooldownMs = 60_000;
const getAuthOtpExpiresInSeconds = () => {
  const configuredExpiry = Number(process.env.AUTH_OTP_EXPIRES_IN_SECONDS || 3600);
  if (!Number.isSafeInteger(configuredExpiry) || configuredExpiry < 60 || configuredExpiry > 86400) {
    throw new Error('AUTH_OTP_EXPIRES_IN_SECONDS must be between 60 and 86400 and match the Supabase Auth email OTP expiry');
  }
  return configuredExpiry;
};

const getSupabaseAdminClient = () => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const createEmailTransporter = (defaultFromName = 'SL Stay') => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password) {
    throw new Error('Configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in server/.env');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.toLowerCase() === 'true'
      : port === 465,
    auth: { user, pass: password },
  });

  return {
    transporter,
    fromEmail: process.env.SMTP_FROM_EMAIL || user,
    fromName: process.env.SMTP_FROM_NAME || defaultFromName,
  };
};

const sendSignupCode = async ({ email, code }) => {
  const { transporter, fromEmail, fromName } = createEmailTransporter('HM Hotel Vendor Portal');
  await transporter.sendMail({
    from: { name: fromName, address: fromEmail },
    to: email,
    subject: 'Your SL Stay verification code',
    text: `Your SL Stay verification code is ${code}. It expires according to your Supabase Auth OTP settings.`,
    html: `<p>Your SL Stay verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${code}</p><p>Enter this code in the app to verify your email.</p>`,
  });
};

const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const sendVendorDecisionEmail = async ({ email, name, status }) => {
  const approved = status === 'approved';
  const subject = approved ? 'Your HM vendor account was accepted' : 'Update about your HM vendor application';
  const greeting = name ? `Hello ${name},` : 'Hello,';
  const decision = approved
    ? 'You have been accepted as an HM hotel vendor. You can now log in and list your property.'
    : 'Your vendor account has been rejected. Please try signing up again with valid documents.';
  const { transporter, fromEmail, fromName } = createEmailTransporter();

  await transporter.sendMail({
    from: { name: fromName, address: fromEmail },
    to: email,
    subject,
    text: `${greeting}\n\n${decision}\n\nThank you,\nHM Hotel Vendor Portal`,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(decision)}</p><p>Thank you,<br>HM Hotel Vendor Portal</p>`,
  });
};

const emailCooldownRemaining = (email) => {
  const now = Date.now();
  for (const [address, lastSentAt] of authEmailCooldowns) {
    if (now - lastSentAt >= authEmailCooldownMs) {
      authEmailCooldowns.delete(address);
    }
  }
  const lastSentAt = authEmailCooldowns.get(email);
  return lastSentAt ? Math.max(0, authEmailCooldownMs - (now - lastSentAt)) : 0;
};

const sendGeneratedAuthCode = async (email, verificationType, generateLink, cleanupFailedSignup) => {
  const cooldownRemaining = emailCooldownRemaining(email);
  if (cooldownRemaining > 0) {
    return { cooldownRemaining };
  }

  const otpExpiresInSeconds = getAuthOtpExpiresInSeconds();
  const { data, error } = await generateLink();
  if (error) {
    throw error;
  }
  const code = data?.properties?.email_otp;
  if (!code) {
    throw new Error(`Supabase did not return an email OTP for ${verificationType}`);
  }
  const generatedAt = Date.now();
  const expiresAt = generatedAt + otpExpiresInSeconds * 1000;

  authEmailCooldowns.set(email, Date.now());
  try {
    await sendSignupCode({ email, code });
  } catch (error) {
    console.error('Unable to send signup verification email:', error.message);
    if (verificationType === 'signup' && data?.user?.id && cleanupFailedSignup) {
      try {
        const { error: cleanupError } = await cleanupFailedSignup(data.user.id);
        if (cleanupError) {
          console.error('Unable to remove unverified account after email delivery failed:', cleanupError.message);
        }
      } catch (cleanupError) {
        console.error('Unable to remove unverified account after email delivery failed:', cleanupError.message);
      }
    }
    throw new Error(
      verificationType === 'signup'
        ? 'The verification email could not be sent. Check the backend SMTP settings, wait one minute, and try registering again.'
        : 'The verification email could not be resent. Check the backend SMTP settings, wait one minute, and try again.',
    );
  }

  return {
    cooldownRemaining: 0,
    data,
    otpLength: code.length,
    expiresInSeconds: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
  };
};

app.post('/api/auth/signup', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const role = req.body?.role === 'vendor' ? 'vendor' : 'user';
  const businessName = typeof req.body?.businessName === 'string' ? req.body.businessName.trim() : '';
  const termsVersion = typeof req.body?.termsVersion === 'string' ? req.body.termsVersion : '';
  const paymentPolicyVersion = typeof req.body?.paymentPolicyVersion === 'string' ? req.body.paymentPolicyVersion : '';
  const paymentPolicyAgreed = req.body?.paymentPolicyAgreed === true;
  const requestedPlanId = req.body?.planId === 'pro' ? 'pro' : 'free';
  if (role === 'vendor' && req.body?.planId !== undefined && !['free', 'pro'].includes(req.body.planId)) {
    return res.status(400).json({ ok: false, error: 'Choose a valid vendor plan.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || password.length < 6) {
    return res.status(400).json({ ok: false, error: 'Enter a valid email, full name, and password of at least six characters.' });
  }
  if (role === 'vendor' && (!businessName || !termsVersion || !paymentPolicyVersion || !paymentPolicyAgreed)) {
    return res.status(400).json({ ok: false, error: 'Vendor business details and acceptance of the vendor and payment policies are required.' });
  }

  const cooldownRemaining = emailCooldownRemaining(email);
  if (cooldownRemaining > 0) {
    return res.status(429).json({ ok: false, error: 'Please wait one minute before requesting another verification email.' });
  }

  const userMetadata = {
    fullname: fullName,
    role,
    ...(role === 'vendor'
      ? {
          business_name: businessName,
          vendor_terms_version: termsVersion,
          vendor_terms_accepted_at: new Date().toISOString(),
          vendor_payment_policy_agreed: true,
          vendor_payment_policy_agreed_at: new Date().toISOString(),
          vendor_payment_policy_version: paymentPolicyVersion,
          pending_plan_id: requestedPlanId,
        }
      : {}),
  };

  try {
    const admin = getSupabaseAdminClient();
    const result = await sendGeneratedAuthCode(email, 'signup', () =>
      admin.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: { data: userMetadata },
      }),
      (userId) => admin.auth.admin.deleteUser(userId),
    );
    if (result.cooldownRemaining > 0) {
      return res.status(429).json({ ok: false, error: 'Please wait one minute before requesting another verification email.' });
    }
    return res.status(201).json({
      ok: true,
      message: 'Verification code sent',
      userId: result.data.user.id,
      verificationType: result.data.properties.verification_type,
      otpLength: result.otpLength,
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create account';
    const duplicateEmail = /already (registered|exists)|user already/i.test(message);
    console.error('Unable to create account:', message);
    return res.status(duplicateEmail ? 409 : 502).json({
      ok: false,
      error: duplicateEmail
        ? 'This email is already registered. Sign in or reset its password instead.'
        : message,
    });
  }
});

app.post('/api/auth/resend-signup-otp', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !userId) {
    return res.status(400).json({ ok: false, error: 'A valid email and registration reference are required.' });
  }
  const cooldownRemaining = emailCooldownRemaining(email);
  if (cooldownRemaining > 0) {
    return res.status(429).json({ ok: false, error: 'Please wait one minute before requesting another verification email.' });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError) throw userError;
    const user = userData.user;
    if (!user || user.email?.toLowerCase() !== email) {
      return res.status(404).json({ ok: false, error: 'The pending registration was not found. Please register again.' });
    }
    if (user.email_confirmed_at) {
      return res.status(409).json({ ok: false, error: 'This email is already verified. Please sign in.' });
    }

    const result = await sendGeneratedAuthCode(email, 'magiclink', () =>
      admin.auth.admin.generateLink({ type: 'magiclink', email }),
    );
    if (result.cooldownRemaining > 0) {
      return res.status(429).json({ ok: false, error: 'Please wait one minute before requesting another verification email.' });
    }
    return res.json({
      ok: true,
      message: 'A new verification code was sent',
      verificationType: result.data.properties.verification_type,
      otpLength: result.otpLength,
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to resend the verification code';
    console.error('Unable to resend signup verification email:', message);
    return res.status(502).json({ ok: false, error: message });
  }
});

app.post('/api/admin/vendors/decision-email', async (req, res) => {
  const vendorId = typeof req.body?.vendorId === 'string' ? req.body.vendorId : '';
  const status = req.body?.status;
  if (!vendorId || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'A vendor ID and approved/rejected decision are required.' });
  }

  try {
    const adminUser = await authenticateRequest(req);
    if (!adminUser?.id) {
      return res.status(401).json({ ok: false, error: 'Administrator sign-in is required.' });
    }

    const adminRows = await supabaseAdminRequest(
      `users?id=eq.${encodeURIComponent(adminUser.id)}&role=eq.admin&disabled=eq.false&select=id&limit=1`,
    );
    if (!adminRows?.length) {
      return res.status(403).json({ ok: false, error: 'Administrator access is required.' });
    }

    const vendorRows = await supabaseAdminRequest(
      `users?id=eq.${encodeURIComponent(vendorId)}&role=eq.vendor&vendor_status=eq.${status}&select=email,fullname,business_name&limit=1`,
    );
    const vendor = vendorRows?.[0];
    if (!vendor?.email) {
      return res.status(409).json({
        ok: false,
        error: 'The vendor decision was not saved or the vendor email could not be found.',
      });
    }

    await sendVendorDecisionEmail({
      email: vendor.email,
      name: vendor.fullname || vendor.business_name || '',
      status,
    });
    return res.json({ ok: true, sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send the vendor decision email.';
    console.error('Unable to send vendor decision email:', message);
    return res.status(502).json({ ok: false, error: message });
  }
});

const createResponse = (message, data = {}) => ({ ok: true, message, ...data });

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for booking payments');
  }
  return { url: url.replace(/\/$/, ''), serviceRoleKey };
};

const supabaseAdminRequest = async (resource, { method = 'GET', body, prefer } = {}) => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseText = await response.text();
  const payload = responseText ? JSON.parse(responseText) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || 'Supabase request failed');
  }
  return payload;
};

const authenticateRequest = async (req) => {
  const authorization = req.headers.authorization;
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) {
    return null;
  }

  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
};

const getOwnedBooking = async (bookingId, userId) => {
  if (typeof bookingId !== 'string' || !bookingId || typeof userId !== 'string' || !userId) {
    return null;
  }

  const rows = await supabaseAdminRequest(
    `bookings?id=eq.${encodeURIComponent(bookingId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,total_price,payment_status,booking_status,payment_method,created_at&limit=1`,
  );
  return rows?.[0] ?? null;
};

const getPaymentByReference = async (reference) => {
  const rows = await supabaseAdminRequest(
    `payments?provider_reference=eq.${encodeURIComponent(reference)}&select=id,booking_id,amount,status,provider_reference,provider_session_id,payment_method&limit=1`,
  );
  return rows?.[0] ?? null;
};

const getPaymentBySessionId = async (sessionId) => {
  const rows = await supabaseAdminRequest(
    `payments?provider_session_id=eq.${encodeURIComponent(sessionId)}&select=id,booking_id,amount,status,provider_reference,provider_session_id,payment_method&limit=1`,
  );
  return rows?.[0] ?? null;
};

const getVendorPlanPaymentByReference = async (reference) => {
  const rows = await supabaseAdminRequest(
    `vendor_plan_payments?provider_reference=eq.${encodeURIComponent(reference)}&select=id,vendor_id,plan_id,amount,status,provider_reference,provider_session_id,checkout_url&limit=1`,
  );
  return rows?.[0] ?? null;
};

const getVendorPlanPaymentBySessionId = async (sessionId) => {
  const rows = await supabaseAdminRequest(
    `vendor_plan_payments?provider_session_id=eq.${encodeURIComponent(sessionId)}&select=id,vendor_id,plan_id,amount,status,provider_reference,provider_session_id,checkout_url&limit=1`,
  );
  return rows?.[0] ?? null;
};

const linkVendorPlanPaymentSession = async (reference, sessionId, checkoutUrl) => {
  const rows = await supabaseAdminRequest(
    `vendor_plan_payments?provider_reference=eq.${encodeURIComponent(reference)}&provider_session_id=is.null`,
    {
      method: 'PATCH',
      body: { provider_session_id: sessionId, checkout_url: checkoutUrl },
      prefer: 'return=representation',
    },
  );
  if (!rows?.length) {
    throw new Error('Monime checkout session could not be linked to the PRO upgrade');
  }
  return rows[0];
};

const updateVendorPlanPaymentStatus = async (reference, status) => {
  const payment = await getVendorPlanPaymentByReference(reference);
  if (!payment) {
    throw new Error('Vendor upgrade payment was not found');
  }
  if (payment.status === 'paid' && status !== 'paid') {
    return payment;
  }

  const statusGuard = status === 'paid' ? '' : '&status=neq.paid';
  const rows = await supabaseAdminRequest(
    `vendor_plan_payments?id=eq.${encodeURIComponent(payment.id)}${statusGuard}`,
    { method: 'PATCH', body: { status }, prefer: 'return=representation' },
  );
  if (!rows?.length && status !== 'paid') {
    const latestPayment = await getVendorPlanPaymentByReference(reference);
    if (latestPayment?.status === 'paid') {
      return latestPayment;
    }
  }
  if (!rows?.length) {
    throw new Error('Vendor upgrade payment status could not be updated');
  }
  return rows[0];
};

const getMonimeCheckoutState = async (payment) => {
  if (!payment.provider_session_id) {
    throw new Error('Monime checkout session is not available for verification yet');
  }

  const monimePayload = await monimeRequest(
    `checkout-sessions/${encodeURIComponent(payment.provider_session_id)}`,
  );
  const checkoutSession = monimePayload?.result;
  if (checkoutSession?.id !== payment.provider_session_id) {
    throw new Error('Monime checkout session did not match this payment');
  }
  if (checkoutSession.reference !== payment.provider_reference) {
    throw new Error('Monime payment reference did not match this booking');
  }

  const providerStatus = String(checkoutSession.status ?? '').toLowerCase();
  let paymentStatus = 'pending';
  if (providerStatus === 'completed') {
    const lineItems = checkoutSession.lineItems?.data;
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      throw new Error('Monime checkout did not return verifiable line items');
    }

    const { currency } = getMonimeConfig();
    let verifiedAmount = 0;
    for (const item of lineItems) {
      const value = Number(item?.price?.value);
      const quantity = Number(item?.quantity ?? 1);
      const itemCurrency = String(item?.price?.currency ?? '').toUpperCase();
      if (
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        itemCurrency !== currency
      ) {
        throw new Error('Monime checkout amount or currency is invalid');
      }
      verifiedAmount += value * quantity;
    }

    if (verifiedAmount !== Math.round(Number(payment.amount) * 100)) {
      throw new Error('Verified Monime amount does not match the booking total');
    }
    paymentStatus = 'paid';
  } else if (providerStatus === 'cancelled' || providerStatus === 'expired') {
    paymentStatus = 'failed';
  } else if (!['pending', 'processing'].includes(providerStatus)) {
    throw new Error(`Unsupported Monime checkout status: ${providerStatus || 'unknown'}`);
  }

  return { paymentStatus, providerStatus };
};

const verifyMonimeWebhookSignature = (rawBody, signatureHeader, secret) => {
  if (!Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string' || !secret) {
    return false;
  }

  const signatureParts = new Map();
  for (const part of signatureHeader.split(',')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex > 0) {
      signatureParts.set(part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim());
    }
  }

  const timestamp = signatureParts.get('t');
  const providedSignature = signatureParts.get('v1');
  if (!timestamp || !/^\d+$/.test(timestamp) || !providedSignature) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestampSeconds}_${rawBody.toString('utf8')}`)
    .digest('base64');
  const expected = Buffer.from(expectedSignature, 'utf8');
  const provided = Buffer.from(providedSignature, 'utf8');
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
};

const updateProviderSessionId = async (reference, sessionId) => {
  const rows = await supabaseAdminRequest(
    `payments?provider_reference=eq.${encodeURIComponent(reference)}&provider_session_id=is.null`,
    {
      method: 'PATCH',
      body: { provider_session_id: sessionId },
      prefer: 'return=representation',
    },
  );
  if (!rows?.length) {
    throw new Error('Monime checkout session could not be linked to the payment');
  }
  return rows[0];
};

const updatePaymentStatus = async (reference, status) => {
  const payment = await getPaymentByReference(reference);
  if (!payment) {
    throw new Error('Payment record was not found');
  }

  if (payment.status === 'paid' && status !== 'paid') {
    return payment;
  }

  const statusGuard = status === 'paid' ? '' : '&status=neq.paid';
  const rows = await supabaseAdminRequest(
    `payments?id=eq.${encodeURIComponent(payment.id)}${statusGuard}`,
    { method: 'PATCH', body: { status }, prefer: 'return=representation' },
  );
  if (!rows?.length && status !== 'paid') {
    const latestPayment = await getPaymentByReference(reference);
    if (latestPayment?.status === 'paid') {
      return latestPayment;
    }
  }
  if (!rows?.length) {
    throw new Error('Payment status could not be updated');
  }

  return rows[0];
};

const getMonimeConfig = () => {
  const accessToken = process.env.MONIME_ACCESS_TOKEN;
  const spaceId = process.env.MONIME_SPACE_ID;
  if (!accessToken || !spaceId) {
    throw new Error('MONIME_ACCESS_TOKEN and MONIME_SPACE_ID are required for Monime payments');
  }
  if (!/^spc-/.test(spaceId)) {
    throw new Error('MONIME_SPACE_ID must be a Monime Space ID beginning with spc-');
  }
  return {
    accessToken,
    spaceId,
    currency: String(process.env.MONIME_CURRENCY || 'SLE').toUpperCase(),
    version: process.env.MONIME_API_VERSION || 'caph.2025-08-23',
  };
};

const monimeRequest = async (resource, { method = 'GET', body, idempotencyKey } = {}) => {
  const { accessToken, spaceId, version } = getMonimeConfig();
  const response = await fetch(`https://api.monime.io/v1/${resource}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Monime-Space-Id': spaceId,
      'Monime-Version': version,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseText = await response.text();
  let payload;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch (_error) {
    throw new Error(`Monime returned an invalid response (${response.status})`);
  }
  if (!response.ok) {
    const providerMessage = payload?.message || payload?.error?.message;
    throw new Error(providerMessage || `Monime request failed (${response.status})`);
  }
  return payload;
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'hotel-management-backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'ready', provider: 'monime' });
});

const getPlatformSettings = async () => {
  const rows = await supabaseAdminRequest(
    'platform_settings?id=eq.1&select=id,commission_type,commission_value,currency,updated_at&limit=1',
  );
  return rows?.[0] ?? {
    id: 1,
    commission_type: 'percentage',
    commission_value: 15,
    currency: 'SLE',
  };
};

const requireAdmin = async (req, res) => {
  const user = await authenticateRequest(req);
  if (!user?.id) {
    res.status(401).json({ ok: false, error: 'Sign in is required.' });
    return false;
  }
  const rows = await supabaseAdminRequest(
    `users?id=eq.${encodeURIComponent(user.id)}&role=eq.admin&disabled=eq.false&select=id&limit=1`,
  );
  if (!rows?.length) {
    res.status(403).json({ ok: false, error: 'Administrator access is required.' });
    return false;
  }
  return user.id;
};

app.get('/api/settings', async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    return res.json({ ok: true, settings });
  } catch (error) {
    console.error('Unable to load platform settings:', error);
    return res.status(500).json({ ok: false, error: 'Unable to load platform settings.' });
  }
});

app.put('/api/admin/settings', async (req, res) => {
  try {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    const commissionType = req.body?.commission_type;
    const commissionValue = Number(req.body?.commission_value);
    const currency = req.body?.currency;
    if (!['percentage', 'fixed_amount'].includes(commissionType)) {
      return res.status(400).json({ ok: false, error: 'Choose percentage or fixed amount.' });
    }
    if (!Number.isFinite(commissionValue) || commissionValue < 0) {
      return res.status(400).json({ ok: false, error: 'Enter a valid commission value.' });
    }
    if (commissionType === 'percentage' && (commissionValue < 5 || commissionValue > 30)) {
      return res.status(400).json({ ok: false, error: 'Percentage commission must be between 5% and 30%.' });
    }
    if (commissionType === 'fixed_amount' && commissionValue > 1_000_000_000) {
      return res.status(400).json({ ok: false, error: 'Fixed commission exceeds the allowed amount.' });
    }
    if (currency !== 'SLE') {
      return res.status(400).json({ ok: false, error: 'Only Sierra Leonean leones (SLE) are available for bookings.' });
    }

    const rows = await supabaseAdminRequest('platform_settings?on_conflict=id', {
      method: 'POST',
      body: {
        id: 1,
        commission_type: commissionType,
        commission_value: commissionValue,
        currency,
        updated_by: adminId,
      },
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    return res.json({ ok: true, settings: rows?.[0] ?? await getPlatformSettings() });
  } catch (error) {
    console.error('Unable to update platform settings:', error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unable to update platform settings.' });
  }
});

const escapePdfText = (value) => value
  .replaceAll('\\', '\\\\')
  .replaceAll('(', '\\(')
  .replaceAll(')', '\\)')
  .replace(/[^\x20-\x7E]/g, '?');

const wrapPdfText = (value, maxLength = 88) => {
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const buildVendorPaymentPdf = (settings) => {
  const total = 1_000_000;
  const commission = settings.commission_type === 'fixed_amount'
    ? Math.min(total, Number(settings.commission_value))
    : Math.round(total * Number(settings.commission_value) / 100);
  const vendorPayout = total - commission;
  const rateDescription = settings.commission_type === 'fixed_amount'
    ? `a flat ${settings.currency} ${Number(settings.commission_value).toLocaleString('en-US')} per paid booking`
    : `${Number(settings.commission_value)}% of each paid booking`;
  const contentLines = [
    { text: 'How Our Commission System Works', font: 'F2', size: 19, gap: 27 },
    { text: 'SL Stay Partner Payment Guide | Currency: Sierra Leonean leones (SLE)', font: 'F1', size: 10, gap: 22 },
    { text: 'Section 1: Free to List', font: 'F2', size: 12, gap: 17 },
    { text: 'There is no listing fee to add a property. Vendor plans may change listing limits, but they do not change the platform commission.', font: 'F1', size: 10 },
    { text: 'Section 2: Commission on Paid Bookings', font: 'F2', size: 12, gap: 17 },
    { text: `The current platform commission is ${rateDescription}. It is charged only when a booking payment is received.`, font: 'F1', size: 10 },
    { text: 'The current rate is set by the platform administrator and may change. The rate in this document is current at the time it is generated.', font: 'F1', size: 10 },
    { text: 'Section 3: When and How You Get Paid', font: 'F2', size: 12, gap: 17 },
    { text: 'After the guest checks out, the vendor share becomes eligible for payout. Transfers are processed manually and the amount is shown in your earnings history.', font: 'F1', size: 10 },
    { text: 'Section 4: No Bypass Policy', font: 'F2', size: 12, gap: 17 },
    { text: 'Guest and vendor contact details are protected before a booking is paid or confirmed. Keep reservations and payments on SL Stay so bookings remain protected, recorded, and eligible for support.', font: 'F1', size: 10 },
    { text: 'Section 5: Featured Listings', font: 'F2', size: 12, gap: 17 },
    { text: 'Featured listing options are coming soon. Any paid promotion will be clearly described before it is offered.', font: 'F1', size: 10 },
    { text: 'Section 6: Example', font: 'F2', size: 12, gap: 17 },
    { text: `Customer pays Le ${total.toLocaleString('en-US')} - Admin gets Le ${commission.toLocaleString('en-US')} - You get Le ${vendorPayout.toLocaleString('en-US')}.`, font: 'F1', size: 10 },
    { text: 'This example uses the current platform setting. The actual commission and payout are calculated from each booking total.', font: 'F1', size: 10 },
  ];

  let y = 744;
  const commands = [];
  for (const line of contentLines) {
    const wrapped = wrapPdfText(line.text);
    for (const text of wrapped) {
      commands.push(`BT /${line.font} ${line.size} Tf 54 ${y} Td (${escapePdfText(text)}) Tj ET`);
      y -= line.size === 19 ? 24 : line.size === 12 ? 18 : 15;
    }
    y -= line.gap ?? 0;
  }

  const stream = `${commands.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
};

app.get('/docs/vendor-payment-system.pdf', async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="vendor-payment-system.pdf"',
      'Cache-Control': 'no-store',
    });
    return res.send(buildVendorPaymentPdf(settings));
  } catch (error) {
    console.error('Unable to generate vendor payment policy PDF:', error);
    return res.status(500).json({ ok: false, error: 'Unable to generate the payment policy document.' });
  }
});

app.post('/api/payments/create', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: 'Sign in is required to initialize payment' });
    }

    const bookingId = typeof req.body?.bookingId === 'string' ? req.body.bookingId : '';
    const booking = bookingId ? await getOwnedBooking(bookingId, user.id) : null;
    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking was not found for this account' });
    }
    if (booking.payment_status === 'paid') {
      return res.status(409).json({ ok: false, error: 'This booking has already been paid' });
    }
    if (booking.payment_method !== 'monime') {
      return res.status(409).json({ ok: false, error: 'This booking is set to pay at the hotel.' });
    }
    if (['cancelled', 'completed', 'checked_out', 'no_show'].includes(booking.booking_status)) {
      return res.status(409).json({ ok: false, error: 'Payment is not available for this booking' });
    }
    if (booking.payment_status === 'failed' || booking.payment_status === 'refunded') {
      return res.status(409).json({ ok: false, error: 'This booking hold was released after payment failed. Create a new booking to check availability again.' });
    }

    const bookingCreatedAt = Date.parse(booking.created_at);
    if (!Number.isFinite(bookingCreatedAt) || Date.now() >= bookingCreatedAt + 15 * 60 * 1000) {
      return res.status(409).json({ ok: false, error: 'This room hold has expired. Create a new booking to check current availability.' });
    }

    const amount = Number(booking.total_price);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'Booking amount must be greater than zero' });
    }

    const provider = 'monime';
    const { currency } = getMonimeConfig();
    const reference = crypto.randomUUID();
    let authorizationUrl;

    if (currency !== 'SLE') {
      return res.status(500).json({ ok: false, error: 'Monime Checkout currently requires MONIME_CURRENCY=SLE' });
    }

    await supabaseAdminRequest('payments', {
      method: 'POST',
      body: {
        booking_id: booking.id,
        amount,
        status: 'pending',
        payment_method: 'monime',
        provider_reference: reference,
      },
      prefer: 'return=minimal',
    });

    try {
      const callbackBase = process.env.PAYMENT_CALLBACK_URL || 'hotelmanagement://payment/callback';
      const callbackUrl = (status) => {
        const query = new URLSearchParams({
          reference,
          bookingId: booking.id,
          status,
        });
        return `${callbackBase}${callbackBase.includes('?') ? '&' : '?'}${query.toString()}`;
      };
      const sessionResponse = await monimeRequest('checkout-sessions', {
        method: 'POST',
        idempotencyKey: reference,
        body: {
          name: `Hotel booking ${booking.id.slice(0, 8)}`,
          description: `Payment for booking ${booking.id}`,
          reference,
          callbackState: reference,
          successUrl: callbackUrl('success'),
          cancelUrl: callbackUrl('cancelled'),
          lineItems: [
            {
              type: 'custom',
              name: 'Hotel stay',
              description: `Booking ${booking.id}`,
              reference: booking.id,
              price: {
                currency,
                value: Math.round(amount * 100),
              },
              quantity: 1,
            },
          ],
        },
      });
      const checkoutSession = sessionResponse?.result;
      if (
        typeof checkoutSession?.id !== 'string' ||
        typeof checkoutSession?.redirectUrl !== 'string' ||
        !checkoutSession.redirectUrl
      ) {
        throw new Error('Monime did not return a checkout URL and session ID');
      }

      await updateProviderSessionId(reference, checkoutSession.id);
      authorizationUrl = checkoutSession.redirectUrl;
    } catch (error) {
      try {
        await updatePaymentStatus(reference, 'failed');
      } catch (statusError) {
        console.error('Unable to mark failed Monime initialization:', statusError);
      }
      throw error;
    }

    return res.status(201).json(
      createResponse('Monime checkout initialized', {
        success: true,
        amount,
        currency,
        bookingId: booking.id,
        reference,
        provider,
        authorization_url: authorizationUrl,
      }),
    );

  } catch (error) {
    console.error('Unable to initialize payment:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to initialize payment',
    });
  }
});

app.post('/api/vendor/upgrade', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: 'Sign in is required to upgrade your vendor plan' });
    }

    const vendors = await supabaseAdminRequest(
      `users?id=eq.${encodeURIComponent(user.id)}&select=id,role,vendor_status,disabled,plan_id&limit=1`,
    );
    const vendor = vendors?.[0];
    if (!vendor || vendor.role !== 'vendor' || vendor.disabled || vendor.vendor_status !== 'approved') {
      return res.status(403).json({ ok: false, error: 'An active, approved vendor account is required to upgrade' });
    }
    if (vendor.plan_id === 'pro') {
      return res.status(409).json({ ok: false, error: 'This vendor already has the PRO plan' });
    }

    const pendingPayments = await supabaseAdminRequest(
      `vendor_plan_payments?vendor_id=eq.${encodeURIComponent(user.id)}&status=eq.pending&select=id,vendor_id,plan_id,amount,status,provider_reference,provider_session_id,checkout_url&limit=1`,
    );
    const pendingPayment = pendingPayments?.[0];
    if (pendingPayment?.provider_session_id) {
      const { paymentStatus } = await getMonimeCheckoutState(pendingPayment);
      if (paymentStatus === 'pending') {
        if (typeof pendingPayment.checkout_url !== 'string' || !pendingPayment.checkout_url) {
          throw new Error('The pending Monime PRO upgrade does not have a checkout URL');
        }
        return res.status(200).json({
          ok: true,
          success: true,
          reference: pendingPayment.provider_reference,
          authorization_url: pendingPayment.checkout_url,
        });
      }
      await updateVendorPlanPaymentStatus(pendingPayment.provider_reference, paymentStatus);
      if (paymentStatus === 'paid') {
        return res.status(409).json({ ok: false, error: 'The PRO upgrade was already completed. Refresh your dashboard.' });
      }
    } else if (pendingPayment) {
      return res.status(409).json({
        ok: false,
        error: 'The PRO upgrade checkout is still being initialized. Try again shortly.',
      });
    }

    const plans = await supabaseAdminRequest(
      'vendor_plans?id=eq.pro&select=id,price&limit=1',
    );
    const plan = plans?.[0];
    const amount = Number(plan?.price);
    if (!plan || !Number.isFinite(amount) || amount !== 100) {
      throw new Error('The PRO plan price is not configured correctly');
    }

    const { currency } = getMonimeConfig();
    if (currency !== 'SLE') {
      return res.status(500).json({ ok: false, error: 'Monime Checkout currently requires MONIME_CURRENCY=SLE' });
    }

    const reference = crypto.randomUUID();
    await supabaseAdminRequest('vendor_plan_payments', {
      method: 'POST',
      body: {
        vendor_id: user.id,
        plan_id: 'pro',
        amount,
        status: 'pending',
        provider_reference: reference,
      },
      prefer: 'return=minimal',
    });

    try {
      const callbackBase = process.env.PAYMENT_CALLBACK_URL || 'hotelmanagement://payment/callback';
      const callbackUrl = (status) => {
        const query = new URLSearchParams({
          reference,
          purchaseType: 'vendor_upgrade',
          status,
        });
        return `${callbackBase}${callbackBase.includes('?') ? '&' : '?'}${query.toString()}`;
      };
      const sessionResponse = await monimeRequest('checkout-sessions', {
        method: 'POST',
        idempotencyKey: reference,
        body: {
          name: 'HM Hotel Vendor PRO plan',
          description: 'One-time vendor plan upgrade',
          reference,
          callbackState: reference,
          successUrl: callbackUrl('success'),
          cancelUrl: callbackUrl('cancelled'),
          lineItems: [
            {
              type: 'custom',
              name: 'PRO vendor plan',
              description: 'One-time upgrade to the PRO vendor plan',
              reference,
              price: { currency, value: Math.round(amount * 100) },
              quantity: 1,
            },
          ],
        },
      });
      const checkoutSession = sessionResponse?.result;
      if (
        typeof checkoutSession?.id !== 'string'
        || typeof checkoutSession?.redirectUrl !== 'string'
        || !checkoutSession.redirectUrl
      ) {
        throw new Error('Monime did not return a checkout URL and session ID');
      }

      await linkVendorPlanPaymentSession(reference, checkoutSession.id, checkoutSession.redirectUrl);
      return res.status(201).json({
        ok: true,
        success: true,
        reference,
        authorization_url: checkoutSession.redirectUrl,
      });
    } catch (error) {
      try {
        await updateVendorPlanPaymentStatus(reference, 'failed');
      } catch (statusError) {
        console.error('Unable to mark failed Monime PRO upgrade initialization:', statusError);
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to initialize the PRO upgrade';
    console.error('Unable to initialize vendor upgrade:', message);
    const statusCode = /vendor_plan_payments_one_pending_per_vendor/.test(message) ? 409 : 500;
    return res.status(statusCode).json({ ok: false, error: message });
  }
});

app.post('/api/vendor/upgrade/verify', async (req, res) => {
  const reference = typeof req.body?.reference === 'string' ? req.body.reference : '';
  if (!reference) {
    return res.status(400).json({ ok: false, error: 'reference is required' });
  }

  try {
    const user = await authenticateRequest(req);
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: 'Sign in is required to verify the PRO upgrade' });
    }
    const payment = await getVendorPlanPaymentByReference(reference);
    if (!payment) {
      return res.status(404).json({ ok: false, error: 'PRO upgrade payment reference was not found' });
    }
    if (payment.vendor_id !== user.id) {
      return res.status(403).json({ ok: false, error: 'This PRO upgrade payment does not belong to your account' });
    }
    if (payment.status === 'paid') {
      return res.json({
        ok: true,
        success: true,
        verified: true,
        data: { reference, status: 'success' },
      });
    }

    const { paymentStatus, providerStatus } = await getMonimeCheckoutState(payment);
    if (paymentStatus !== 'pending' && payment.status !== paymentStatus) {
      await updateVendorPlanPaymentStatus(reference, paymentStatus);
    }
    return res.json({
      ok: true,
      success: true,
      verified: paymentStatus === 'paid',
      data: {
        reference,
        status: paymentStatus === 'paid' ? 'success' : paymentStatus,
        providerStatus,
      },
    });
  } catch (error) {
    console.error('Unable to verify vendor upgrade:', error);
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to verify the PRO upgrade',
    });
  }
});

app.post('/api/payments/verify', async (req, res) => {
  const reference = typeof req.body?.reference === 'string' ? req.body.reference : '';

  if (!reference) {
    return res.status(400).json({ ok: false, error: 'reference is required' });
  }

  let user;
  let payment;
  try {
    user = await authenticateRequest(req);
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: 'Sign in is required to verify payment' });
    }
    payment = await getPaymentByReference(reference);
    if (!payment) {
      return res.status(404).json({ ok: false, error: 'Payment reference was not found' });
    }
    const booking = await getOwnedBooking(payment.booking_id, user.id);
    if (!booking) {
      return res.status(403).json({ ok: false, error: 'This payment does not belong to your account' });
    }
  } catch (error) {
    console.error('Unable to load payment:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to load payment',
    });
  }

  if (payment.payment_method === 'monime') {
    try {
      if (payment.status === 'paid') {
        return res.json(
          createResponse('Monime payment was already verified', {
            success: true,
            verified: true,
            data: { reference, status: 'success' },
          }),
        );
      }
      const { paymentStatus, providerStatus } = await getMonimeCheckoutState(payment);

      if (payment.status !== paymentStatus && paymentStatus !== 'pending') {
        await updatePaymentStatus(reference, paymentStatus);
      }

      return res.json(
        createResponse('Monime payment status verified', {
          success: true,
          verified: paymentStatus === 'paid',
          data: {
            reference,
            status: paymentStatus === 'paid' ? 'success' : paymentStatus,
            providerStatus,
            amount: Math.round(Number(payment.amount) * 100),
            currency: process.env.MONIME_CURRENCY || 'SLE',
          },
        }),
      );
    } catch (error) {
      console.error('Unable to verify Monime payment:', error);
      return res.status(502).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Monime verification request failed',
      });
    }
  }

  return res.status(400).json({ ok: false, error: 'Unsupported payment provider for this transaction' });
});

app.post('/api/payments/monime-webhook', async (req, res) => {
  const webhookSecret = process.env.MONIME_WEBHOOK_SECRET;
  const rawBody = req.body;
  if (!webhookSecret) {
    return res.status(503).json({ ok: false, error: 'MONIME_WEBHOOK_SECRET is not configured' });
  }
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ ok: false, error: 'Monime webhook body must be raw JSON' });
  }
  if (!verifyMonimeWebhookSignature(rawBody, req.headers['monime-signature'], webhookSecret)) {
    return res.status(401).json({ ok: false, error: 'Invalid Monime webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (_error) {
    return res.status(400).json({ ok: false, error: 'Malformed Monime webhook payload' });
  }

  const eventName = typeof event.event?.name === 'string' ? event.event.name : '';
  if (!eventName.startsWith('checkout_session.')) {
    return res.status(200).json({ ok: true, received: true, ignored: true });
  }

  const sessionId = typeof event.data?.id === 'string'
    ? event.data.id
    : typeof event.object?.id === 'string'
      ? event.object.id
      : '';
  if (!sessionId || (event.object?.type && event.object.type !== 'checkout_session')) {
    return res.status(400).json({ ok: false, error: 'Monime checkout session ID is missing or invalid' });
  }

  try {
    const payment = await getPaymentBySessionId(sessionId);
    const vendorPlanPayment = payment ? null : await getVendorPlanPaymentBySessionId(sessionId);
    const checkoutPayment = payment ?? vendorPlanPayment;
    if (!checkoutPayment) {
      return res.status(503).json({ ok: false, error: 'Payment for this Monime checkout session is not linked yet' });
    }

    const { paymentStatus } = await getMonimeCheckoutState(checkoutPayment);
    const eventRequiresTerminalState = eventName === 'checkout_session.completed'
      ? paymentStatus !== 'paid'
      : ['checkout_session.cancelled', 'checkout_session.expired'].includes(eventName) && paymentStatus === 'pending';
    if (eventRequiresTerminalState) {
      return res.status(503).json({ ok: false, error: 'Monime has not finalized this checkout session yet' });
    }
    if (paymentStatus !== 'pending' && checkoutPayment.status !== paymentStatus) {
      if (payment) {
        await updatePaymentStatus(payment.provider_reference, paymentStatus);
      } else if (vendorPlanPayment) {
        await updateVendorPlanPaymentStatus(vendorPlanPayment.provider_reference, paymentStatus);
      }
    }

    return res.status(200).json({
      ok: true,
      received: true,
      event: eventName,
      paymentType: vendorPlanPayment ? 'vendor_upgrade' : 'booking',
    });
  } catch (error) {
    console.error('Unable to process Monime webhook:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to process Monime webhook',
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Hotel backend listening on port ${port} on all network interfaces`);
});