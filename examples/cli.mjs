import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ServerBastion, verifyWebhook} from '../dist/bastion.esm.mjs';

const [mode, input, extra] = process.argv.slice(2);
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const required = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
let client;
try {
  let output;
  if (mode === 'webhook') {
    if (!input || !extra) throw new Error('Usage: webhook raw-body.json signature.txt');
    const raw = await readFile(input), signature = (await readFile(extra, 'utf8')).trim();
    if (!await verifyWebhook(required('BASTION_WEBHOOK_SECRET'), raw, signature)) throw new Error('Invalid or stale webhook signature');
    output = {verified: true, event: JSON.parse(raw.toString('utf8'))};
  } else {
    if (!['verify', 'batch', 'challenge'].includes(mode)) throw new Error('Usage: verify telemetry.json order.json | batch requests.json | challenge | webhook raw-body.json signature.txt');
    client = new ServerBastion({siteKey: required('BASTION_SITE_KEY'), secret: required('BASTION_SECRET_KEY'), endpoint: process.env.BASTION_ENDPOINT});
    if (mode === 'verify') {
      const telemetry = await json(input), order = await json(extra);
      if (!telemetry.token || !telemetry.fingerprint || !telemetry.idempotency_key) throw new Error('Complete buildRequest() telemetry with a stable idempotency_key is required');
      if (typeof order.customerId !== 'string' || !order.customerId || typeof order.paymentId !== 'string' || !order.paymentId || !Number.isFinite(order.amount) || order.amount < 0) throw new Error('Trusted order needs customerId, paymentId, and a finite nonnegative amount');
      const decision = await client.verify({token: telemetry.token, fingerprint: telemetry.fingerprint, behavior: telemetry.behavior, environment: telemetry.environment, idempotency_key: telemetry.idempotency_key, context: {event_type: 'checkout', account_id: order.customerId, order_amount: order.amount, payment_hash: order.paymentId}});
      output = {allowed: decision.action === 'allow', decision};
    } else if (mode === 'batch') {
      const requests = await json(input);
      if (!Array.isArray(requests) || requests.length < 1 || requests.length > 50 || requests.some(r => !r.idempotency_key)) throw new Error('Batch needs 1–50 server-owned requests, each with a stable idempotency_key');
      const result = await client.batch(requests);
      output = {...result, results: result.results.map(item => ({...item, allowed: item.success === true && item.decision?.action === 'allow'}))};
      if (result.results.some(item => !item.success)) process.exitCode = 2;
    } else {
      const challenge = await client.createChallenge(4);
      const deadline = Math.min(Date.now() + 60000, Date.parse(challenge.expires_at));
      let nonce = 0;
      while (!createHash('sha256').update(challenge.prefix + nonce.toString(36)).digest('hex').startsWith('0'.repeat(challenge.difficulty))) {
        if (Date.now() >= deadline) throw new Error('Proof solver deadline reached');
        nonce++;
      }
      const result = await client.verifyChallenge(challenge.challenge_id, nonce.toString(36));
      if (!result.valid) throw new Error('Proof was rejected');
      output = {...result, fulfillment_authorized: false};
    }
  }
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(`Example failed: ${error.message}${error.status ? ` (HTTP ${error.status})` : ''}`);
  process.exitCode = 1;
} finally { client?.destroy(); }
