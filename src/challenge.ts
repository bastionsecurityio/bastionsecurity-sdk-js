import type { ChallengeRequest, ChallengeSolution } from './types';

const WORKER_CODE = `
self.onmessage = async function(e) {
  const { prefix, difficulty, id } = e.data;
  const target = '0'.repeat(difficulty);
  const encoder = new TextEncoder();
  let nonce = 0;
  const start = performance.now();

  while (true) {
    const input = prefix + nonce.toString(36);
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    let hex = '';
    for (let i = 0; i < hashArray.length; i++) {
      hex += hashArray[i].toString(16).padStart(2, '0');
    }

    if (hex.startsWith(target)) {
      self.postMessage({
        id,
        nonce,
        hash: hex,
        solveTimeMs: performance.now() - start,
      });
      return;
    }
    nonce++;

    // yield every 10k iterations to keep the worker responsive
    if (nonce % 10000 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
};
`;

export class ChallengeSolver {
  private worker: Worker | null = null;

  async solve(challenge: ChallengeRequest): Promise<ChallengeSolution> {
    // Try Web Worker first, fall back to main thread
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      return this.solveInWorker(challenge);
    }
    return this.solveMainThread(challenge);
  }

  private solveInWorker(challenge: ChallengeRequest): Promise<ChallengeSolution> {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        this.worker = new Worker(url);

        const timeout = setTimeout(() => {
          this.worker?.terminate();
          this.worker = null;
          URL.revokeObjectURL(url);
          reject(new Error('Challenge solve timeout'));
        }, 30000);

        this.worker.onmessage = (e: MessageEvent<ChallengeSolution>) => {
          clearTimeout(timeout);
          this.worker?.terminate();
          this.worker = null;
          URL.revokeObjectURL(url);
          resolve(e.data);
        };

        this.worker.onerror = (err) => {
          clearTimeout(timeout);
          this.worker?.terminate();
          this.worker = null;
          URL.revokeObjectURL(url);
          reject(err);
        };

        this.worker.postMessage(challenge);
      } catch (err) {
        reject(err);
      }
    });
  }

  private async solveMainThread(challenge: ChallengeRequest): Promise<ChallengeSolution> {
    const { prefix, difficulty, id } = challenge;
    const target = '0'.repeat(difficulty);
    const encoder = new TextEncoder();
    let nonce = 0;
    const start = performance.now();

    while (true) {
      const input = prefix + nonce.toString(36);
      const data = encoder.encode(input);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = new Uint8Array(hashBuffer);
      let hex = '';
      for (let i = 0; i < hashArray.length; i++) {
        hex += hashArray[i].toString(16).padStart(2, '0');
      }

      if (hex.startsWith(target)) {
        return { id, nonce, hash: hex, solveTimeMs: performance.now() - start };
      }
      nonce++;

      if (nonce % 5000 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
