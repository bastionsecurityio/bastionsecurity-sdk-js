import type { NetworkSignals } from './types';

interface NetworkInfo {
  type?: string;
  downlink?: number;
  rtt?: number;
  effectiveType?: string;
}

export class NetworkCollector {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async collect(): Promise<NetworkSignals> {
    const conn = (navigator as unknown as Record<string, NetworkInfo>).connection;

    const rttMeasurements = await this.measureRtt(3);
    const measuredRtt =
      rttMeasurements.length > 0
        ? rttMeasurements.reduce((a, b) => a + b, 0) / rttMeasurements.length
        : 0;

    let rttVariance = 0;
    if (rttMeasurements.length > 1) {
      const mean = measuredRtt;
      const squaredDiffs = rttMeasurements.map((r) => (r - mean) ** 2);
      rttVariance = Math.sqrt(
        squaredDiffs.reduce((a, b) => a + b, 0) / (rttMeasurements.length - 1),
      );
    }

    return {
      connectionType: conn?.type ?? 'unknown',
      downlink: conn?.downlink ?? 0,
      rtt: conn?.rtt ?? 0,
      effectiveType: conn?.effectiveType ?? 'unknown',
      measuredRtt,
      rttVariance,
    };
  }

  private async measureRtt(samples: number): Promise<number[]> {
    const results: number[] = [];

    for (let i = 0; i < samples; i++) {
      try {
        const start = performance.now();
        await fetch(`${this.endpoint}/v1/ping`, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
        });
        const elapsed = performance.now() - start;
        results.push(elapsed);
      } catch {
        // network error, skip this sample
      }
    }

    return results;
  }
}
