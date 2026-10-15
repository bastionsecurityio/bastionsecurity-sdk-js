import type { BastionOptions, ClassifyResult, ClassifyContext, Decision, VerificationRequest, Challenge, FingerprintResult } from './types';
import { FingerprintCollector } from './fingerprint';
import { BehavioralCollector } from './behavioral';
import { ChallengeSolver } from './challenge';
import { browserPolicy, applies, browserReceipt } from './browser-evidence';
import { Transport, BastionError } from './transport';

export default class Bastion {
  private fingerprint = new FingerprintCollector();
  private behavioral = new BehavioralCollector();
  private challenge = new ChallengeSolver();
  private transport: Transport;
  private lastToken = '';
  private deviceId = '';
  private expiresAt = 0;
  private collecting?: Promise<string>;
  private destroyed = false;
  constructor(options: BastionOptions) {
    this.transport = new Transport(options.endpoint, options.siteKey, options);
    if (options.monitorOnInit !== false) this.startMonitoring();
  }
  async getToken(): Promise<string> {
    if (this.destroyed) throw new BastionError('SDK has been destroyed');
    if (this.lastToken && Date.now() < this.expiresAt - 30000) return this.lastToken;
    if (this.collecting) return this.collecting;
    this.collecting = (async () => {
      const fingerprint = await this.collectFingerprint();
      const result = await this.transport.post<FingerprintResult>('/fingerprint', {fingerprint, behavior: this.behavioral.getSignals()});
      if (!result.token || !result.device_id) throw new BastionError('Invalid fingerprint response');
      this.lastToken = result.token; this.deviceId = result.device_id;
      this.expiresAt = result.expires_at ? Date.parse(result.expires_at) : Date.now() + 10 * 60000;
      return result.token;
    })();
    try { return await this.collecting; } finally { this.collecting = undefined; }
  }
  /** Send this entire request to your server to preserve the anti-bot telemetry. */
  async buildRequest(context: ClassifyContext): Promise<VerificationRequest> {
    return this.prepareRequest(context);
  }
  private async prepareRequest(context: ClassifyContext, suppliedToken?: string): Promise<VerificationRequest> {
    if (this.destroyed) throw new BastionError('SDK has been destroyed');
    const policy = await browserPolicy(this.transport);
    const enabled = applies(policy, context.event_type);
    const request: VerificationRequest = {
      ...(enabled ? {} : {token: suppliedToken || await this.getToken()}),
      fingerprint: await this.collectFingerprint(), context, behavior: this.behavioral.getSignals(),
      environment: await this.collectEnvironment(), idempotency_key: crypto.randomUUID(),
    };
    if (!enabled) return request;
    try {
      const receipt = await browserReceipt(this.transport, request);
      // Authenticated telemetry stays in the exchange; the application forwards an opaque receipt.
      return {context, idempotency_key: request.idempotency_key, browser_receipt: receipt};
    } catch(error) {
      if (policy.mode === 'enforce') throw error;
      if (policy.encryptedExchange) return {context,idempotency_key:request.idempotency_key};
      return request; // Monitoring cannot interrupt a legitimate action if collection fails.
    }
  }
  async classify(token: string, context: ClassifyContext = {event_type: 'page_view', account_id: this.deviceId || 'anonymous'}): Promise<ClassifyResult> {
    if (token && token === this.lastToken && Date.now() >= this.expiresAt - 30000) token = await this.getToken();
    const request = await this.prepareRequest(context, token);
    const decision = await this.transport.post<Decision>('/collect', request);
    return {...decision, riskScore: decision.risk_score, requestId: decision.request_id, reasons: (decision.signals || []).map(s => s.description)};
  }
  /** Record a generic custom-control interaction without text, cookie choices or input contents. */
  recordInteraction(): void { this.behavioral.recordInteraction(); }
  async track(event: ClassifyContext['event_type'], data: Record<string, unknown> = {}): Promise<ClassifyResult> {
    return this.classify((data.accountId || data.account_id) ? '' : await this.getToken(), {
      event_type: event, account_id: String(data.accountId || data.account_id || this.deviceId),
      email: data.email as string | undefined, payment_hash: (data.paymentHash ?? data.payment_hash) as string | undefined,
      promo_code: (data.promoCode ?? data.promo_code) as string | undefined,
      order_amount: (data.amount ?? data.order_amount) as number | undefined,
      request_url: String(data.request_url || window.location.href),
    });
  }
  async createChallenge(): Promise<Challenge> { return this.transport.post<Challenge>('/challenge', {}); }
  async solveChallenge(challenge: Challenge): Promise<boolean> {
    const solution = await this.challenge.solve({id: challenge.challenge_id, prefix: challenge.prefix, difficulty: challenge.difficulty, expires_at: challenge.expires_at});
    const result = await this.transport.post<{valid: boolean}>('/challenge/verify', {challenge_id: solution.id, nonce: solution.nonce.toString(36)});
    return result.valid === true;
  }
  async flush(): Promise<void> { await this.transport.flush(); }
  startMonitoring(): void { if (this.destroyed) throw new BastionError('SDK has been destroyed'); this.behavioral.start(); }
  stopMonitoring(): void { this.behavioral.stop(); }
  destroy(): void { this.destroyed = true; this.behavioral.stop(); this.challenge.destroy(); this.transport.destroy(); }
  private async collectFingerprint(): Promise<Record<string, unknown>> {
    const f = await this.fingerprint.collect();
    return {canvas_hash: f.canvas.hash, webgl_renderer: f.webgl.renderer, webgl_vendor: f.webgl.vendor, audio_fingerprint: f.audio.hash,
      fonts: f.fonts.detected, screen_resolution: `${f.screen.width}x${f.screen.height}`, color_depth: f.screen.colorDepth,
      timezone: f.timing.timezone, timezone_offset: f.timing.timezoneOffset, language: f.browser.language, languages: f.browser.languages,
      platform: f.browser.platform, user_agent: f.browser.userAgent, hardware_concurrency: f.browser.hardwareConcurrency,
      device_memory: f.browser.deviceMemory, touch_support: f.browser.maxTouchPoints > 0, max_touch_points: f.browser.maxTouchPoints,
      cookies_enabled: f.browser.cookieEnabled, webdriver: f.automation.webdriver,
      automation_flags: Object.entries(f.automation).filter(([,v]) => v === true).map(([k]) => k)};
  }
  private async collectEnvironment(): Promise<Record<string, unknown>> {
    const f = await this.fingerprint.collect();
    const nav = navigator as any; const win = window as any;
    return {nonce: crypto.randomUUID(), request_timestamp: Date.now(), chrome_runtime: Boolean(win.chrome?.runtime), has_chrome_obj: Boolean(win.chrome),
      notification_permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
      plugin_mime_types: nav.mimeTypes?.length || 0, viewport_width: window.innerWidth, viewport_height: window.innerHeight,
      outer_width: window.outerWidth, outer_height: window.outerHeight, browser_timezone: f.timing.timezone,
      connection_type: nav.connection?.effectiveType || 'unknown', connection_rtt_ms: nav.connection?.rtt || 0,
      webgl_extensions: f.webgl.extensions, has_permissions_api: Boolean(nav.permissions), has_battery_api: Boolean(nav.getBattery),
      has_gamepad_api: Boolean(nav.getGamepads), has_bluetooth_api: Boolean(nav.bluetooth), has_usb_api: Boolean(nav.usb),
      has_serial_api: Boolean(nav.serial), service_worker_ready: Boolean(nav.serviceWorker?.controller)};
  }
}
export { ServerBastion, verifyWebhook } from './server';
export { BastionError } from './transport';
export type * from './types';

export { Bastion };
