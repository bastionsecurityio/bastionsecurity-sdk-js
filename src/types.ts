export interface BastionOptions {
  siteKey: string;
  endpoint?: string;
  debug?: boolean;
  monitorOnInit?: boolean;
  collectInterval?: number;
  timeout?: number;
  retries?: number;
}

export interface CanvasSignals {
  hash: string;
  emojiHash: string;
}

export interface WebGLSignals {
  vendor: string;
  renderer: string;
  extensions: string[];
  maxTextureSize: number;
  maxRenderBufferSize: number;
  maxViewportWidth: number;
  maxViewportHeight: number;
  shadingLanguageVersion: string;
  antialiasing: boolean;
  hash: string;
}

export interface AudioSignals {
  hash: string;
  sampleRate: number;
  channelCount: number;
  oscillatorValue: number;
}

export interface ScreenSignals {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  colorDepth: number;
  pixelRatio: number;
  hdr: boolean;
  colorGamut: string;
  orientation: string;
}

export interface BrowserSignals {
  userAgent: string;
  platform: string;
  language: string;
  languages: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  cookieEnabled: boolean;
  doNotTrack: string | null;
  pdfViewerEnabled: boolean;
  vendor: string;
  productSub: string;
}

export interface FontSignals {
  detected: string[];
  count: number;
}

export interface WebRTCSignals {
  candidateCount: number;
  mediaDeviceCount: number;
  hasIPv4: boolean;
  hasIPv6: boolean;
}

export interface StorageSignals {
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  webWorkers: boolean;
  serviceWorkers: boolean;
  webAssembly: boolean;
}

export interface TimingSignals {
  timezoneOffset: number;
  timezone: string;
  performancePrecision: number;
}

export interface AutomationSignals {
  webdriver: boolean;
  phantom: boolean;
  nightmare: boolean;
  selenium: boolean;
  domAutomation: boolean;
  headlessChrome: boolean;
  puppeteer: boolean;
  pluginsInconsistency: boolean;
  languagesInconsistency: boolean;
  webglInconsistency: boolean;
  score: number;
}

export interface DeviceFingerprint {
  id: string;
  canvas: CanvasSignals;
  webgl: WebGLSignals;
  audio: AudioSignals;
  screen: ScreenSignals;
  browser: BrowserSignals;
  fonts: FontSignals;
  webrtc: WebRTCSignals;
  storage: StorageSignals;
  timing: TimingSignals;
  automation: AutomationSignals;
}

export interface MouseMetrics {
  totalDistance: number;
  avgSpeed: number;
  maxSpeed: number;
  straightLineRatio: number;
  entropy: number;
  teleportCount: number;
  clickCount: number;
  avgClickInterval: number;
}

export interface KeyboardMetrics {
  avgInterKeyInterval: number;
  interKeyVariance: number;
  avgHoldDuration: number;
  holdVariance: number;
  pasteCount: number;
  typingSpeed: number;
}

export interface ScrollMetrics {
  totalScrollDistance: number;
  avgVelocity: number;
  jitter: number;
  directionChanges: number;
  jumpCount: number;
}

export interface TouchMetrics {
  avgPressure: number;
  multiTouchCount: number;
  avgTouchDuration: number;
}

export interface BehavioralProfile {
  mouseEntropy: number;
  mouseVelocityStd: number;
  straightLineRatio: number;
  keystrokeVariance: number;
  avgKeyHoldMs: number;
  scrollJitter: number;
  interactionCount: number;
  sessionDurationMs: number;
  isBotLikely: boolean;
  confidence: number;
  mouse: MouseMetrics;
  keyboard: KeyboardMetrics;
  scroll: ScrollMetrics;
  touch: TouchMetrics;
}

export interface NetworkSignals {
  connectionType: string;
  downlink: number;
  rtt: number;
  effectiveType: string;
  measuredRtt: number;
  rttVariance: number;
}

export interface ChallengeRequest {
  expires_at?: string;
  id: string;
  prefix: string;
  difficulty: number;
}

export interface ChallengeSolution {
  id: string;
  nonce: number;
  hash: string;
  solveTimeMs: number;
}

export interface TokenPayload {
  fp: string;
  signals: Omit<DeviceFingerprint, "id">;
  behavioral: BehavioralProfile;
  network: NetworkSignals;
  challenge?: ChallengeSolution;
  ts: number;
  site_key: string;
  hmac: string;
}

export type EventType = 'signup' | 'login' | 'promo_claim' | 'checkout' | 'page_view';
export interface ClassifyContext {
  event_type: EventType;
  account_id: string;
  email?: string;
  ip_address?: string;
  user_agent?: string;
  payment_hash?: string;
  promo_code?: string;
  order_amount?: number;
  request_url?: string;
  /** Supply only from the server after validating credentials. Browser claims are ignored. */
  login_succeeded?: boolean;
}
export interface BrowserProtection { mode: "off"|"monitor"|"enforce"; telemetry: boolean; interactions: boolean; encryptedExchange: boolean; events: string[]; }
export interface VerificationRequest {
  browser_receipt?: string;
  token?: string;
  fingerprint?: Record<string, unknown>;
  behavior?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  headers?: Record<string, string>;
  context: ClassifyContext;
  username?: string;
  idempotency_key?: string;
}
export interface SignalResult { rule: string; score: number; description: string; }
export interface Challenge { challenge_id: string; prefix: string; difficulty: number; expires_at: string; }
export interface Decision {
  classification: 'human' | 'bot' | 'suspicious';
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  action: 'allow' | 'challenge' | 'block' | 'review';
  request_id: string;
  device_id: string;
  signals: SignalResult[];
  browser_evidence?: { active: boolean; mode: string; status: string; encrypted: boolean; interacted: boolean; needsVerification: boolean };
  identity?: { cluster_id: string; linked_accounts: number; shared_devices: number; shared_ips: number; shared_payments: number };
  challenge?: Challenge;
  decision_ms: number;
  timestamp: string;
}
export interface ClassifyResult extends Decision {
  riskScore: number;
  requestId: string;
  reasons: string[];
}
export interface BatchResult {
  accepted: number;
  results: Array<{ index: number; success: boolean; decision?: Decision; status?: number; message?: string }>;
}
export interface FingerprintResult { token: string; device_id: string; expires_at: string; spoofing_score: number; timestamp: string; }
export interface ServerOptions { siteKey: string; secret: string; endpoint?: string; timeout?: number; retries?: number; }
export interface TrackEvent { event: EventType; data: Record<string, unknown>; fp: string; token: string; ts: number; site_key: string; }
