import { Transport, BastionError } from './transport';
import type { ServerOptions, VerificationRequest, Decision, FingerprintResult, BatchResult, Challenge } from './types';
export class ServerBastion {
  private transport: Transport;
  constructor(options: ServerOptions) {
    if (!options.secret) throw new BastionError('Server secret is required');
    this.transport = new Transport(options.endpoint, options.siteKey, options, options.secret);
  }
  verify(request: VerificationRequest): Promise<Decision> {
    return this.transport.post('/verify', {...request, idempotency_key: request.idempotency_key || crypto.randomUUID()});
  }
  classify(token: string, context: VerificationRequest['context']): Promise<Decision> { return this.verify({token, context}); }
  track(event: VerificationRequest['context']['event_type'], data: Omit<VerificationRequest['context'], 'event_type'>, token?: string): Promise<Decision> {
    return this.verify({token, context: {...data, event_type: event}});
  }
  fingerprint(fingerprint: Record<string, unknown>, behavior?: Record<string, unknown>): Promise<FingerprintResult> {
    return this.transport.post('/verify/fingerprint', {fingerprint, behavior});
  }
  batch(events: VerificationRequest[]): Promise<BatchResult> {
    return this.transport.post('/verify/batch', {events: events.map(e => ({...e, idempotency_key: e.idempotency_key || crypto.randomUUID()}))});
  }
  createChallenge(difficulty?: number): Promise<Challenge> { return this.transport.post('/verify/challenge', {difficulty}); }
  verifyChallenge(challengeId: string, nonce: string): Promise<{valid: boolean}> {
    return this.transport.post('/verify/challenge/verify', {challenge_id: challengeId, nonce});
  }
  flush(): Promise<void> { return this.transport.flush(); }
  destroy(): void { this.transport.destroy(); }
}
/** Verify the exact raw bytes before parsing JSON. Supports multiple signatures during key rotation. */
export async function verifyWebhook(secret: string, rawBody: string | Uint8Array, signature: string, tolerance = 300, now = Math.floor(Date.now()/1000)): Promise<boolean> {
  if (!secret || !Number.isFinite(tolerance) || tolerance < 0) return false;
  const parts = signature.split(',').map(p => p.trim());
  const timestamp = parts.find(p => /^t=\d+$/.test(p))?.slice(2);
  if (!timestamp || Math.abs(now - Number(timestamp)) > tolerance) return false;
  const encoder = new TextEncoder();
  const prefix = encoder.encode(timestamp + '.');
  const payload = typeof rawBody === 'string' ? encoder.encode(rawBody) : rawBody;
  const message = new Uint8Array(prefix.length + payload.length); message.set(prefix); message.set(payload, prefix.length);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  for (const part of parts) {
    if (!/^v1=[0-9a-f]{64}$/.test(part)) continue;
    const bytes = Uint8Array.from(part.slice(3).match(/../g)!, h => parseInt(h,16));
    if (await crypto.subtle.verify('HMAC', key, bytes, message)) return true;
  }
  return false;
}
