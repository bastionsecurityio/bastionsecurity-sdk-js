# Bastion JavaScript SDK (0.2)

Browser fingerprinting, bounded behavioral telemetry, automation/environment signals, server scoring, proof challenges, and signed-webhook verification. The platform's embedded SDK uses the same source.

Install the current source release: `npm install github:bastionsecurityio/sdk`. Git installation runs the TypeScript/Rollup build; Node 20+ is required for the server client. Registry publication is separate from this source release. A browser-only script is also served by the deployed website at `https://web-production-c0739.up.railway.app/sdk/bastion.js` (`BastionSDK.Bastion`).

```js
// Browser: only the PUBLIC site key belongs here.
import Bastion from '@bastionsecurity/sdk';
const browser = new Bastion({siteKey: 'YOUR_PUBLIC_SITE_KEY'});
const request = await browser.buildRequest({
  event_type: 'checkout', account_id: authenticatedAccountId,
  order_amount: amount, payment_hash: paymentProviderIdentifier
});
// Send the complete request to your own server, preserving all telemetry.
```

```js
// Server: never ship the secret key to the browser.
import {ServerBastion} from '@bastionsecurity/sdk';
const server = new ServerBastion({siteKey: process.env.BASTION_SITE_KEY, secret: process.env.BASTION_SECRET_KEY});
const decision = await server.verify({
  ...browserRequest,
  context: {...browserRequest.context, account_id: authenticatedAccountId, order_amount: validatedAmount}
});
if (decision.action !== 'allow') throw new Error('Challenge or review required');
// Only now fulfill the action. Preserve the request idempotency_key across application retries.
```

The endpoint defaults to the deployed Railway API, normalizes a root URL or `/api` to `/api/antibot`, and can be configured. HTTPS is required except on localhost. Customer browser origins must be explicitly allowed in the site's Settings.

Browser methods: `getToken()` (registered server token, refreshes before its 10-minute expiry), `buildRequest(context)` (full telemetry), `classify(token, context)`, `track(event, data)` (await the returned decision), `createChallenge()`, `solveChallenge(challenge)`, `flush()`, monitoring start/stop, and `destroy()`. Track accepts camelCase `accountId`, `paymentHash`, `promoCode`, `amount` or their API snake_case equivalents. Event types: `signup`, `login`, `promo_claim`, `checkout`, `page_view`. Never send raw card details or passwords. The behavioral collector sends timing/counters, not typed content.

Server methods: `verify(request)`, `classify(token, context)`, `track(event, context, token?)`, `fingerprint(fingerprint, behavior?)`, `batch(requests)`, `createChallenge(difficulty?)`, `verifyChallenge(id, nonce)`, `flush()`, `destroy()`. Server context may include trustworthy end-user `ip_address`, `user_agent`, `headers`, `login_succeeded` (only after your server validates login credentials), and checkout/payment/promo fields. Browser login-success claims are ignored by the API.

Decisions include `action`, `classification`, `risk_score`, `risk_level`, scored `signals` with descriptions, `identity`, `device_id`, `request_id`, `timestamp`, `decision_ms`, and optional `challenge`. Browser decisions additionally preserve the original camelCase aliases `riskScore`, `requestId`, `reasons`. Batch returns `accepted` and per-item `results`; inspect every item and retry only failures with their original keys. Scoring requests retry network failures/429/5xx at most twice by default (`timeout`, `retries` configurable); validation/auth failures are never retried. The API stores durable scoring receipts for 24 hours; reusing a key with different telemetry/context returns 409. Await `track`/`flush` before navigation; `destroy()` aborts in-flight work instead of pretending delivery succeeded.

A successfully solved proof is single-use and site-bound. It does not authorize checkout or override a block/review decision. Enforce the returned action on your server and complete your challenge/review policy before fulfillment.

```js
import {verifyWebhook} from '@bastionsecurity/sdk';
if (!await verifyWebhook(process.env.BASTION_WEBHOOK_SECRET, rawBodyBytes, signatureHeader)) {
  throw new Error('Invalid webhook');
}
// Parse JSON only after verification. Persist the event ID to deduplicate retries.
```

Verification uses HMAC-SHA256 over `timestamp.raw-body`, constant-time verification, and a 5-minute clock tolerance. Supports multiple `v1=` signatures. Webhooks are delivered at least once; use the event ID to deduplicate.

`npm test` covers retry/auth/signature contracts. `node test/e2e.cjs` runs real-service checks only with an isolated local `BASTION_QA_SESSION` file. Dashboard management, billing, team, SSO, and support use the platform's authenticated control-plane API; these scoring SDKs never require a user's dashboard token. Stripe, Resend, and enterprise IdP credentials are configured in the platform, not the SDK.

0.1 migration: remove invented local tokens, `/v1` platform URLs and `X-Bastion-*` HMAC authentication. Use real fingerprint registration and `/api/antibot` with `X-Site-Key` + `X-Secret-Key` for server requests; always supply explicit business context.

Make your own fulfillment operation idempotent as well: persist the decision/request ID and never fulfill the same logical checkout twice. API retry receipts deduplicate scoring, not your payment provider or business operations.
