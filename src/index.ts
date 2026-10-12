import type {
  BastionOptions,
  ClassifyResult,
  TokenPayload,
  TrackEvent,
  ChallengeRequest,
} from './types';
import { FingerprintCollector } from './fingerprint';
import { BehavioralCollector } from './behavioral';
import { NetworkCollector } from './network';
import { ChallengeSolver } from './challenge';
import { Transport } from './transport';

const DEFAULT_ENDPOINT = 'https://api.bastionsecurity.io';

export default class Bastion {
  private siteKey: string;
  private endpoint: string;
  private debug: boolean;
  private fingerprint: FingerprintCollector;
  private behavioral: BehavioralCollector;
  private network: NetworkCollector;
  private challenge: ChallengeSolver;
  private transport: Transport;
  private initialized = false;

  constructor(options: BastionOptions) {
    this.siteKey = options.siteKey;
    this.endpoint = options.endpoint || DEFAULT_ENDPOINT;
    this.debug = options.debug || false;

    this.fingerprint = new FingerprintCollector();
    this.behavioral = new BehavioralCollector();
    this.network = new NetworkCollector(this.endpoint);
    this.challenge = new ChallengeSolver();
    this.transport = new Transport(this.endpoint, this.siteKey);

    if (options.monitorOnInit !== false) {
      this.startMonitoring();
    }

    this.initialized = true;
    this.log('Bastion SDK initialized');
  }

  async getToken(): Promise<string> {
    const [fp, networkSignals] = await Promise.all([
      this.fingerprint.collect(),
      this.network.collect(),
    ]);

    const behavioralProfile = this.behavioral.getProfile();

    let challengeSolution;
    try {
      const challengeReq = await this.transport.post<ChallengeRequest>(
        '/v1/challenge',
        { site_key: this.siteKey, fp: fp.id },
      );
      challengeSolution = await this.challenge.solve(challengeReq);
    } catch {
      this.log('Challenge skipped (server unavailable or timeout)');
    }

    const { id: _id, ...signals } = fp;

    const payload: TokenPayload = {
      fp: fp.id,
      signals,
      behavioral: behavioralProfile,
      network: networkSignals,
      challenge: challengeSolution,
      ts: Date.now(),
      site_key: this.siteKey,
      hmac: '',
    };

    const payloadStr = JSON.stringify(payload);
    payload.hmac = await this.computeHmac(payloadStr);

    const token = btoa(JSON.stringify(payload));
    this.log('Token generated', { fp: fp.id });
    return token;
  }

  async classify(token: string): Promise<ClassifyResult> {
    return this.transport.post<ClassifyResult>('/v1/classify', { token });
  }

  track(event: string, data: Record<string, unknown>): void {
    this.fingerprint.collect().then((fp) => {
      const trackEvent: TrackEvent = {
        event,
        data,
        fp: fp.id,
        ts: Date.now(),
        site_key: this.siteKey,
      };
      this.transport.enqueue(trackEvent);
      this.log('Event tracked', { event });
    });
  }

  startMonitoring(): void {
    this.behavioral.start();
    this.log('Behavioral monitoring started');
  }

  stopMonitoring(): void {
    this.behavioral.stop();
    this.log('Behavioral monitoring stopped');
  }

  destroy(): void {
    this.behavioral.stop();
    this.challenge.destroy();
    this.transport.destroy();
    this.initialized = false;
    this.log('Bastion SDK destroyed');
  }

  private async computeHmac(data: string): Promise<string> {
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

  private log(message: string, data?: Record<string, unknown>): void {
    if (!this.debug) return;
    if (data) {
      console.log(`[Bastion] ${message}`, data);
    } else {
      console.log(`[Bastion] ${message}`);
    }
  }
}

export type {
  BastionOptions,
  ClassifyResult,
  DeviceFingerprint,
  BehavioralProfile,
  TokenPayload,
} from './types';
