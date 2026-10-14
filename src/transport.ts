import type { BastionOptions } from './types';

export const DEFAULT_ENDPOINT = 'https://api.bastionsecurity.io/api/antibot';
export function normalizeEndpoint(endpoint = DEFAULT_ENDPOINT): string {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    throw new Error('Bastion requires HTTPS (HTTP is allowed only for local development)');
  if (url.username || url.password || url.search || url.hash) throw new Error('Invalid API endpoint');
  const pathname = url.pathname.replace(/\/$/, '');
  url.pathname = !pathname ? '/api/antibot' : pathname === '/api' ? '/api/antibot' : pathname;
  return url.toString().replace(/\/$/, '');
}
export class BastionError extends Error {
  constructor(message: string, public status = 0, public response?: unknown) { super(message); this.name = 'BastionError'; }
}
export class Transport {
  private endpoint: string;
  private controllers = new Set<AbortController>();
  private stopped = false;
  private pending = new Set<Promise<unknown>>();
  constructor(endpoint: string | undefined, private siteKey: string, private options: Pick<BastionOptions, 'timeout' | 'retries'> = {}, private secret?: string) {
    this.endpoint = normalizeEndpoint(endpoint);
    if (!siteKey || /[\r\n]/.test(siteKey) || (secret && /[\r\n]/.test(secret))) throw new Error('Valid site credentials are required');
  }
  post<T>(path: string, body: unknown): Promise<T> {
    const work = this.send<T>(path, body);
    this.pending.add(work);
    work.then(() => this.pending.delete(work), () => this.pending.delete(work));
    return work;
  }
  private async send<T>(path: string, body: any): Promise<T> {
    const serialized = JSON.stringify(body);
    const retrySafe = Boolean(body?.idempotency_key) || (Array.isArray(body?.events) && body.events.every((e: any) => e.idempotency_key));
    const retries = retrySafe ? Math.min(3, Math.max(0, this.options.retries ?? 2)) : 0;
    for (let attempt = 0; ; attempt++) {
      if (this.stopped) throw new BastionError('SDK has been destroyed');
      const controller = new AbortController();
      this.controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), Math.min(30000, Math.max(1000, this.options.timeout ?? 15000)));
      let retryAfter = 0;
      try {
        const res = await fetch(this.endpoint + path, {
          method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-Site-Key': this.siteKey, ...(this.secret ? { 'X-Secret-Key': this.secret } : {}) }, body: serialized,
        });
        let data: any;
        try { data = await res.json(); } catch { throw new BastionError('API returned an invalid JSON response', res.status); }
        if (!res.ok) {
          retryAfter = Math.min(3000, Number(res.headers.get('retry-after') || 0) * 1000);
          throw new BastionError(String(data.message || 'API request failed'), res.status, data);
        }
        if (data?.success === false || !data || typeof data !== 'object') throw new BastionError('Invalid API response', res.status, data);
        return (data.data ?? data) as T;
      } catch (error) {
        const failure = error instanceof BastionError ? error : new BastionError(controller.signal.aborted ? 'API request timed out or was cancelled' : 'API request could not reach the server');
        if (this.stopped || attempt >= retries || (failure.status > 0 && failure.status !== 429 && failure.status < 500)) throw failure;
      } finally { clearTimeout(timer); this.controllers.delete(controller); }
      await new Promise(resolve => setTimeout(resolve, retryAfter || 250 * 2 ** attempt));
    }
  }
  async flush(): Promise<void> { await Promise.all([...this.pending]); }
  destroy(): void { this.stopped = true; for (const controller of this.controllers) controller.abort(); }
}
