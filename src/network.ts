import type { NetworkSignals } from './types';
/** Network Information API values are optional observations, never fabricated RTT probes. */
export class NetworkCollector {
  constructor(_endpoint?: string) {}
  async collect(): Promise<NetworkSignals> {
    const conn = (navigator as any).connection;
    return { connectionType: conn?.type ?? 'unknown', downlink: conn?.downlink ?? 0,
      rtt: conn?.rtt ?? 0, effectiveType: conn?.effectiveType ?? 'unknown', measuredRtt: 0, rttVariance: 0 };
  }
}
