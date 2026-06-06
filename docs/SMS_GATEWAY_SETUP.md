# SMS Gateway Setup (Cloud Mode)

EnatAI uses **SMS Gateway for Android** (by capcom6) in **cloud mode**. The phone and server both talk to `api.sms-gate.app` — no direct connection between them needed.

**App:** [Play Store](https://play.google.com/store/apps/details?id=com.capcom.smsgateway) | [Docs](https://docs.sms-gate.app) | [GitHub](https://github.com/capcom6/android-sms-gateway)

## How It Works

```
Mother's Phone
     |
     | SMS
     v
Your Android Phone  ──→  api.sms-gate.app  ←──  EnatAI on Vercel
  (receives SMS)          (cloud relay)          (processes message)
     ^                         |
     |                         |
     └─── sends reply SMS ←────┘
```

Both the phone and the server talk to the cloud API. No port forwarding, no VPN, no same-Wi-Fi requirement.

## Step 1: Install the App

1. Install [SMS Gateway for Android](https://play.google.com/store/apps/details?id=com.capcom.smsgateway)
2. Insert a SIM with SMS capability (Ethio Telecom)
3. Grant permissions: **SMS** (read + send)
4. Disable battery optimization: Settings → Apps → SMS Gateway → Battery → Unrestricted

## Step 2: Enable Cloud Mode

1. Open the app
2. On the **Home** tab, toggle **Cloud Server** on
3. Tap the **Offline** button to connect
4. Note the **Username** and **Password** shown on the Home tab

These are your API credentials. No separate signup needed.

## Step 3: Configure EnatAI

Add to `.env.local`:

```bash
SMS_PROVIDER=sms-gateway
SMS_GATEWAY_URL=https://api.sms-gate.app/3rdparty/v1
SMS_GATEWAY_USERNAME=<username from app>
SMS_GATEWAY_PASSWORD=<password from app>
```

## Step 4: Register the Webhook

Tell the cloud to forward incoming SMS to your server:

```bash
curl -X POST -u <username>:<password> \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://your-domain.vercel.app/api/webhooks/sms", "event": "sms:received" }' \
  https://api.sms-gate.app/3rdparty/v1/webhooks
```

For local dev with ngrok:

```bash
npx ngrok http 3000

curl -X POST -u <username>:<password> \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://xxxx.ngrok.io/api/webhooks/sms", "event": "sms:received" }' \
  https://api.sms-gate.app/3rdparty/v1/webhooks
```

Verify it registered:

```bash
curl -u <username>:<password> \
  https://api.sms-gate.app/3rdparty/v1/webhooks
```

## Step 5: Test

### Send a test SMS through the cloud:

```bash
curl -X POST -u <username>:<password> \
  -H "Content-Type: application/json" \
  -d '{ "phoneNumbers": ["+251912345678"], "message": "EnatAI test" }' \
  https://api.sms-gate.app/3rdparty/v1/message
```

### End-to-end test:

1. Send an SMS from another phone to the SIM in your gateway phone
2. The app forwards it to the cloud
3. The cloud sends the webhook to your server
4. EnatAI processes it and sends a reply through the cloud API
5. The phone sends the reply SMS
6. The mother receives the response

## Deployment

1. Deploy: `vercel --prod`
2. Set env vars in Vercel dashboard:
   - `SMS_PROVIDER=sms-gateway`
   - `SMS_GATEWAY_URL=https://api.sms-gate.app/3rdparty/v1`
   - `SMS_GATEWAY_USERNAME=...`
   - `SMS_GATEWAY_PASSWORD=...`
   - Plus all Supabase and Hasab AI vars
3. Register webhook with your production URL

## Phone Maintenance

- Keep the phone plugged in with Wi-Fi or mobile data
- The app needs internet to sync with the cloud
- Disable battery optimization
- Check `system:ping` events to monitor uptime

## Troubleshooting

| Problem | Solution |
|---------|----------|
| SMS not sending | Check username/password, verify phone is online |
| Inbound not arriving | Verify webhook registered (`GET /webhooks`) |
| Phone disconnected | Reopen app, tap Online/Offline toggle |
| Webhook returning 401 | Check `SMS_GATEWAY_SIGNING_KEY` or remove it to skip verification |
