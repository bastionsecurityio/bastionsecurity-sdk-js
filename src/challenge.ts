import type { ChallengeRequest, ChallengeSolution } from './types';
const WORKER_CODE = `
self.onmessage = async ({data: {id,prefix,difficulty}}) => {
  try {
    const target = '0'.repeat(difficulty), start = performance.now(), encoder = new TextEncoder();
    for (let nonce=0; performance.now()-start<30000; nonce++) {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(prefix+nonce.toString(36))));
      const hash = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      if (hash.startsWith(target)) { self.postMessage({id,nonce,hash,solveTimeMs:performance.now()-start}); return; }
    }
    throw new Error('Challenge solve timeout');
  } catch (error) { self.postMessage({error:String(error)}); }
};`;
export class ChallengeSolver {
  private cancelled = new Set<() => void>();
  private destroyed = false;
  async solve(challenge: ChallengeRequest): Promise<ChallengeSolution> {
    if (this.destroyed) throw new Error('SDK has been destroyed');
    if (!challenge.id || !challenge.prefix || !Number.isInteger(challenge.difficulty) || challenge.difficulty < 2 || challenge.difficulty > 6)
      throw new Error('Invalid proof challenge');
    const expiry = challenge.expires_at ? Date.parse(challenge.expires_at) : Date.now()+30000;
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error('Challenge has expired');
    const timeout = Math.min(30000, expiry-Date.now());
    if (typeof Worker !== 'undefined') {
      let worker: Worker | undefined, url: string | undefined;
      try { url = URL.createObjectURL(new Blob([WORKER_CODE],{type:'application/javascript'})); worker = new Worker(url); }
      catch { if (url) URL.revokeObjectURL(url); }
      if (worker && url) {
        const activeWorker = worker, activeUrl = url;
        return new Promise((resolve,reject) => {
          const cleanup = () => { clearTimeout(timer); activeWorker.terminate(); URL.revokeObjectURL(activeUrl); this.cancelled.delete(cancel); };
          const cancel = () => { cleanup(); reject(new Error('Challenge solve cancelled')); };
          const timer = setTimeout(() => {cleanup();reject(new Error('Challenge solve timeout'));},timeout);
          this.cancelled.add(cancel);
          activeWorker.onmessage = event => {cleanup(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data);};
          activeWorker.onerror = () => {cleanup();reject(new Error('Proof worker failed'));};
          activeWorker.postMessage(challenge);
        });
      }
    }
    const start = performance.now(), target = '0'.repeat(challenge.difficulty), encoder = new TextEncoder();
    for (let nonce=0; !this.destroyed && performance.now()-start<timeout; nonce++) {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(challenge.prefix+nonce.toString(36))));
      const hash = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      if (hash.startsWith(target)) return {id:challenge.id,nonce,hash,solveTimeMs:performance.now()-start};
      if (nonce % 256 === 0) await new Promise(resolve=>setTimeout(resolve,0));
    }
    throw new Error(this.destroyed ? 'Challenge solve cancelled' : 'Challenge solve timeout');
  }
  destroy(): void { this.destroyed=true; for (const cancel of [...this.cancelled]) cancel(); }
}
