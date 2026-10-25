# Monime webhook receiver

A small Express server that verifies Monime webhook signatures against the
original raw request body, acknowledges valid deliveries, then parses and logs
the event.

## Setup

In PowerShell, move into this folder, install dependencies, and create a local
environment file:

```powershell
cd C:\Users\SAEED\Desktop\HM\server\monime-webhook
npm install
Copy-Item .env.example .env
```

Copy `.env.example` to `.env` and set `MONIME_WEBHOOK_SECRET` to the signing
secret shown for your webhook in Monime. Never commit `.env` or put the secret
in client-side code.

## Start the receiver

```powershell
npm start
```

The server listens on port 3000 by default. Set `PORT` in `.env` to use a
different port. `GET /health` returns `ok`. The webhook endpoint is
`POST /api/monime/webhook`.

## Expose it with ngrok

In another terminal, run:

```powershell
ngrok http 3000
```

Copy the HTTPS forwarding host printed by ngrok and append
`/api/monime/webhook`. For example, if ngrok prints
`https://abc123.ngrok-free.app`, paste
`https://abc123.ngrok-free.app/api/monime/webhook` into Monime as the webhook
URL. Keep the receiver running while testing.

## Send a fake signed event

With the server running and `.env` configured, open another terminal in this
folder and run:

```powershell
npm run test:webhook
```

The test script signs a local fake `checkout_session.completed` event with
your local webhook secret. It does not call Monime or move money.

## Signature and event processing

Monime's HMAC verification guide currently contains a placeholder. This
receiver uses Monime's published integration format: the `Monime-Signature`
header has `t=<unix timestamp>,v1=<base64 signature>`, and the HMAC-SHA256
input is `<timestamp>_<exact raw request body>`. Requests outside a five-minute
window are rejected. Confirm the format against a real Monime test delivery if
Monime changes its webhook guidance.

Valid requests receive HTTP 200 before JSON parsing or application processing.
Invalid signatures receive HTTP 401. The receiver logs the event type and
payload, and ignores repeated event IDs in memory. This duplicate tracking is
lost on restart and is not shared between server instances; use a database with
a unique event ID constraint in production.

Add your order or booking update in the TODO inside `server.js`.
