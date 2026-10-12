import type { TrackEvent } from './types';

interface QueuedEvent {
  payload: TrackEvent;
  retries: number;
}

export class Transport {
  private endpoint: string;
  private siteKey: string;
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private maxRetries = 3;
  private batchSize = 10;
  private flushIntervalMs = 5000;

  constructor(endpoint: string, siteKey: string) {
    this.endpoint = endpoint;
    this.siteKey = siteKey;
    this.startFlushLoop();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flushBeacon();
        }
      });
    }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const bodyStr = JSON.stringify(body);
    const timestamp = Date.now().toString();
    const signature = await this.sign(bodyStr + timestamp);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bastion-Site-Key': this.siteKey,
            'X-Bastion-Timestamp': timestamp,
            'X-Bastion-Signature': signature,
          },
          body: bodyStr,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.maxRetries) {
          await this.backoff(attempt);
        }
      }
    }

    throw lastError;
  }

  enqueue(event: TrackEvent): void {
    this.queue.push({ payload: event, retries: 0 });

    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  private startFlushLoop(): void {
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);
    const payloads = batch.map((e) => e.payload);

    try {
      await this.post('/v1/events/batch', { events: payloads });
    } catch {
      // re-queue failed events that haven't exceeded retries
      for (const item of batch) {
        if (item.retries < this.maxRetries) {
          item.retries++;
          this.queue.push(item);
        }
      }
    }
  }

  private flushBeacon(): void {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);
    const payloads = batch.map((e) => e.payload);
    const body = JSON.stringify({ events: payloads });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${this.endpoint}/v1/events/batch`, blob);
    }
  }

  private async sign(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.siteKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private backoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * 2 ** attempt + Math.random() * 1000, 10000);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushBeacon();
  }
}
