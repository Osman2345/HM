/* global __dirname, Buffer */
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 3000);
const processedEventIds = new Set();

// Monime's guide is currently a placeholder. These values match Monime's
// published integrations: Monime-Signature, HMAC-SHA256, t=<seconds>,v1=<base64>,
// signing `${timestamp}_${rawBody}`.
const SIGNATURE_HEADER = 'monime-signature';
const SIGNATURE_ALGORITHM = 'sha256';

function isValidSignature(rawBody, signatureHeader, secret) {
  if (!Buffer.isBuffer(rawBody) || !signatureHeader || !secret) {
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
    .createHmac(SIGNATURE_ALGORITHM, secret)
    .update(`${timestampSeconds}_${rawBody.toString('utf8')}`)
    .digest('base64');
  const expected = Buffer.from(expectedSignature, 'utf8');
  const provided = Buffer.from(providedSignature, 'utf8');

  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.post(
  '/api/monime/webhook',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.MONIME_WEBHOOK_SECRET;
    if (!secret) {
      console.error('MONIME_WEBHOOK_SECRET is not configured.');
      return res.status(500).send('Webhook secret is not configured');
    }

    if (!isValidSignature(req.body, req.get(SIGNATURE_HEADER), secret)) {
      return res.status(401).send('Invalid signature');
    }

    const rawBody = req.body;
    res.status(200).send('ok');

    // Acknowledge first, then do event parsing and processing.
    setImmediate(() => {
      try {
        const event = JSON.parse(rawBody.toString('utf8'));
        const eventId = event.event?.id || event.id;
        const eventType = event.event?.name || event.type || 'unknown';

        if (eventId && processedEventIds.has(eventId)) {
          console.log(`Duplicate event ignored: ${eventId} (${eventType})`);
          return;
        }
        if (eventId) {
          processedEventIds.add(eventId);
        }

        console.log('Monime event type:', eventType);
        console.log('Monime event payload:', JSON.stringify(event, null, 2));

        // TODO: Add your business logic here (for example, mark an order as paid).
      } catch (error) {
        console.error('Could not parse the signed Monime webhook JSON:', error.message);
      }
    });
  },
);

app.listen(port, () => {
  console.log(`Monime webhook receiver listening on http://localhost:${port}`);
});
