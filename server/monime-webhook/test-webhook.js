/* global __dirname */
const crypto = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
  const secret = process.env.MONIME_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('Set MONIME_WEBHOOK_SECRET in server/monime-webhook/.env first.');
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = JSON.stringify({
    event: {
      id: `evt_local_${crypto.randomUUID()}`,
      name: 'checkout_session.completed',
      timestamp,
    },
    object: {
      id: 'cs_local_test',
      type: 'checkout_session',
    },
    data: {
      id: 'cs_local_test',
      status: 'completed',
      reference: 'local-webhook-test',
    },
  });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}_${payload}`)
    .digest('base64');
  const port = process.env.PORT || 3000;
  const url = process.env.WEBHOOK_TEST_URL || `http://localhost:${port}/api/monime/webhook`;
  const healthResponse = await fetch(new URL('/health', url));
  if (healthResponse.status !== 200 || (await healthResponse.text()) !== 'ok') {
    throw new Error('Health check failed. Start the webhook server before running this test.');
  }

  const request = (body) => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Monime-Signature': `t=${timestamp},v1=${signature}`,
    },
    body,
  });

  const invalidResponse = await request(`${payload} `);
  await invalidResponse.text();
  if (invalidResponse.status !== 401) {
    throw new Error(`Expected a tampered payload to receive 401; got ${invalidResponse.status}.`);
  }

  for (let delivery = 1; delivery <= 2; delivery += 1) {
    const response = await request(payload);
    const responseText = await response.text();
    console.log(`Signed delivery ${delivery}: ${response.status} ${responseText}`);
    if (response.status !== 200) {
      throw new Error(`Expected signed delivery ${delivery} to receive 200.`);
    }
  }
  console.log('Tampered signature rejected; duplicate signed delivery acknowledged.');
}

main().catch((error) => {
  console.error('Webhook test failed:', error.message);
  process.exitCode = 1;
});
