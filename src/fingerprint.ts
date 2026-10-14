import type {
  CanvasSignals,
  WebGLSignals,
  AudioSignals,
  ScreenSignals,
  BrowserSignals,
  FontSignals,
  WebRTCSignals,
  StorageSignals,
  TimingSignals,
  AutomationSignals,
  DeviceFingerprint,
} from "./types";

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function collectCanvas(): CanvasSignals {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 60;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { hash: "", emojiHash: "" };

  ctx.fillStyle = "#f60";
  ctx.fillRect(125, 1, 62, 20);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#069";
  ctx.font = "11pt Arial";
  ctx.fillText("Cwm fjordbank glyph vext quiz, 😀", 2, 15);

  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.font = "18pt Arial";
  ctx.fillText("Cwm fjordbank glyph vext quiz, 😀", 4, 45);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#ff0000");
  gradient.addColorStop(0.5, "#00ff00");
  gradient.addColorStop(1, "#0000ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 50, canvas.width, 10);

  ctx.beginPath();
  ctx.arc(50, 30, 10, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  const mainData = canvas.toDataURL();

  const emojiCanvas = document.createElement("canvas");
  emojiCanvas.width = 200;
  emojiCanvas.height = 50;
  const ectx = emojiCanvas.getContext("2d");
  let emojiData = "";
  if (ectx) {
    ectx.font = "30px serif";
    ectx.fillText("🤔🚀🌍🌟🔥", 0, 35);
    emojiData = emojiCanvas.toDataURL();
  }

  return {
    hash: mainData,
    emojiHash: emojiData,
  };
}

function collectWebGL(): WebGLSignals {
  const canvas = document.createElement("canvas");
  const gl =
    (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

  if (!gl) {
    return {
      vendor: "",
      renderer: "",
      extensions: [],
      maxTextureSize: 0,
      maxRenderBufferSize: 0,
      maxViewportWidth: 0,
      maxViewportHeight: 0,
      shadingLanguageVersion: "",
      antialiasing: false,
      hash: "",
    };
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = debugInfo
    ? (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string)
    : (gl.getParameter(gl.VENDOR) as string);
  const renderer = debugInfo
    ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
    : (gl.getParameter(gl.RENDERER) as string);

  const extensions = (gl.getSupportedExtensions() || []).sort();
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const maxRenderBufferSize = gl.getParameter(
    gl.MAX_RENDERBUFFER_SIZE,
  ) as number;
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const shadingLanguageVersion = gl.getParameter(
    gl.SHADING_LANGUAGE_VERSION,
  ) as string;
  const antialiasing = !!gl.getContextAttributes()?.antialias;

  const raw = JSON.stringify({
    vendor,
    renderer,
    extensions,
    maxTextureSize,
    maxRenderBufferSize,
    shadingLanguageVersion,
    antialiasing,
  });

  return {
    vendor,
    renderer,
    extensions,
    maxTextureSize,
    maxRenderBufferSize,
    maxViewportWidth: viewport?.[0] ?? 0,
    maxViewportHeight: viewport?.[1] ?? 0,
    shadingLanguageVersion,
    antialiasing,
    hash: raw,
  };
}

async function collectAudio(): Promise<AudioSignals> {
  try {
    const AudioCtx =
      (window as unknown as Record<string, unknown>).OfflineAudioContext ||
      (window as unknown as Record<string, unknown>).webkitOfflineAudioContext;
    if (!AudioCtx)
      return { hash: "", sampleRate: 0, channelCount: 0, oscillatorValue: 0 };

    const context = new (
      AudioCtx as new (
        channels: number,
        length: number,
        sampleRate: number,
      ) => OfflineAudioContext
    )(1, 44100, 44100);

    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(10000, context.currentTime);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, context.currentTime);
    compressor.knee.setValueAtTime(40, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0, context.currentTime);
    compressor.release.setValueAtTime(0.25, context.currentTime);

    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const buffer = await Promise.race([
      context.startRendering(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Audio observation unavailable")), 2000); }),
    ]).finally(() => { clearTimeout(timer); oscillator.disconnect(); compressor.disconnect(); });
    const data = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) {
      sum += Math.abs(data[i]);
    }

    return {
      hash: sum.toString(),
      sampleRate: buffer.sampleRate,
      channelCount: buffer.numberOfChannels,
      oscillatorValue: sum,
    };
  } catch {
    return { hash: "", sampleRate: 0, channelCount: 0, oscillatorValue: 0 };
  }
}

function collectScreen(): ScreenSignals {
  const screen = window.screen;
  let hdr = false;
  let colorGamut = "srgb";

  try {
    hdr = window.matchMedia("(dynamic-range: high)").matches;
    if (window.matchMedia("(color-gamut: rec2020)").matches)
      colorGamut = "rec2020";
    else if (window.matchMedia("(color-gamut: p3)").matches) colorGamut = "p3";
  } catch {
    // matchMedia not available
  }

  let orientation = "unknown";
  try {
    orientation = screen.orientation?.type ?? "unknown";
  } catch {
    // orientation API not available
  }

  return {
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio || 1,
    hdr,
    colorGamut,
    orientation,
  };
}

function collectBrowser(): BrowserSignals {
  const nav = navigator;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    languages: Array.from(nav.languages || []),
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    deviceMemory: (nav as unknown as Record<string, number>).deviceMemory || 0,
    maxTouchPoints: nav.maxTouchPoints || 0,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    pdfViewerEnabled:
      (nav as unknown as Record<string, boolean>).pdfViewerEnabled ?? false,
    vendor: nav.vendor,
    productSub: (nav as unknown as Record<string, string>).productSub ?? "",
  };
}

const FONT_LIST = [
  "Arial",
  "Arial Black",
  "Arial Narrow",
  "Calibri",
  "Cambria",
  "Cambria Math",
  "Comic Sans MS",
  "Consolas",
  "Courier",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Helvetica Neue",
  "Impact",
  "Lucida Console",
  "Lucida Sans Unicode",
  "Microsoft Sans Serif",
  "Monaco",
  "Palatino Linotype",
  "Segoe UI",
  "Tahoma",
  "Times",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "Andale Mono",
  "Book Antiqua",
  "Bookman Old Style",
  "Century Gothic",
  "Century Schoolbook",
  "Franklin Gothic Medium",
  "Garamond",
  "Gill Sans",
  "Lucida Bright",
  "Lucida Grande",
  "MS Gothic",
  "MS PGothic",
  "MS Sans Serif",
  "MS Serif",
  "Palatino",
  "Symbol",
  "Wingdings",
  "Wingdings 2",
  "Wingdings 3",
  "Apple Chancery",
  "Apple Color Emoji",
  "Apple SD Gothic Neo",
  "Futura",
  "Menlo",
  "Optima",
  "San Francisco",
  "SF Pro",
  "Ubuntu",
  "Roboto",
  "Noto Sans",
  "Droid Sans",
  "Open Sans",
];

function collectFonts(): FontSignals {
  const baseFonts = ["monospace", "sans-serif", "serif"] as const;
  const testString = "mmmmmmmmmmlli";
  const testSize = "72px";

  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.left = "-9999px";
  span.style.top = "-9999px";
  span.style.fontSize = testSize;
  span.style.lineHeight = "normal";
  span.textContent = testString;
  document.body.appendChild(span);

  const baseWidths: Record<string, number> = {};
  const baseHeights: Record<string, number> = {};
  for (const base of baseFonts) {
    span.style.fontFamily = base;
    baseWidths[base] = span.offsetWidth;
    baseHeights[base] = span.offsetHeight;
  }

  const detected: string[] = [];
  for (const font of FONT_LIST) {
    let found = false;
    for (const base of baseFonts) {
      span.style.fontFamily = `'${font}', ${base}`;
      if (
        span.offsetWidth !== baseWidths[base] ||
        span.offsetHeight !== baseHeights[base]
      ) {
        found = true;
        break;
      }
    }
    if (found) detected.push(font);
  }

  document.body.removeChild(span);

  return { detected, count: detected.length };
}

async function collectWebRTC(): Promise<WebRTCSignals> {
  const result: WebRTCSignals = {
    candidateCount: 0,
    mediaDeviceCount: 0,
    hasIPv4: false,
    hasIPv6: false,
  };

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    result.mediaDeviceCount = devices.length;
  } catch {
    // mediaDevices not available
  }

  try {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pc.createDataChannel("");

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 3000);
      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        result.candidateCount++;
        const candidate = event.candidate.candidate;
        if (/\d+\.\d+\.\d+\.\d+/.test(candidate)) result.hasIPv4 = true;
        if (/[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7}/.test(candidate))
          result.hasIPv6 = true;
      };
    });

    pc.close();
  } catch {
    // WebRTC not available
  }

  return result;
}

function collectStorage(): StorageSignals {
  const test = (fn: () => boolean): boolean => {
    try {
      return fn();
    } catch {
      return false;
    }
  };

  return {
    localStorage: test(() => {
      localStorage.setItem("__ps_t", "1");
      localStorage.removeItem("__ps_t");
      return true;
    }),
    sessionStorage: test(() => {
      sessionStorage.setItem("__ps_t", "1");
      sessionStorage.removeItem("__ps_t");
      return true;
    }),
    indexedDB: test(() => !!window.indexedDB),
    webWorkers: test(() => !!window.Worker),
    serviceWorkers: test(() => !!navigator.serviceWorker),
    webAssembly: test(() => typeof WebAssembly === "object"),
  };
}

function collectTiming(): TimingSignals {
  let performancePrecision = 0;
  try {
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t1 = performance.now();
      const t2 = performance.now();
      if (t2 > t1) times.push(t2 - t1);
    }
    if (times.length > 0) {
      performancePrecision = Math.min(...times);
    }
  } catch {
    // performance.now not available
  }

  let timezone = "unknown";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Intl not available
  }

  return {
    timezoneOffset: new Date().getTimezoneOffset(),
    timezone,
    performancePrecision,
  };
}

function collectAutomation(): AutomationSignals {
  const w = window as unknown as Record<string, unknown>;
  const d = document as unknown as Record<string, unknown>;
  const n = navigator as unknown as Record<string, unknown>;

  const webdriver = !!n.webdriver;
  const phantom = !!w._phantom || !!w.callPhantom;
  const nightmare = !!w.__nightmare;
  const selenium =
    !!d.__selenium_unwrapped ||
    !!d.__selenium_evaluate ||
    !!d.__fxdriver_evaluate;
  const domAutomation = !!w.domAutomation || !!w.domAutomationController;

  let headlessChrome = false;
  try {
    headlessChrome =
      /HeadlessChrome/.test(navigator.userAgent) ||
      (navigator.vendor === "Google Inc." &&
        !(w.chrome as Record<string, unknown>)?.runtime &&
        !!(w.chrome as Record<string, unknown>));
  } catch {
    // check failed
  }

  let puppeteer = false;
  try {
    puppeteer =
      !!w._puppeteer ||
      (!!n.webdriver &&
        navigator.userAgent.includes("Chrome") &&
        navigator.plugins.length === 0);
  } catch {
    // check failed
  }

  let pluginsInconsistency = false;
  try {
    const isChromium = /Chrome|Chromium/.test(navigator.userAgent);
    if (isChromium && navigator.plugins.length === 0) {
      pluginsInconsistency = true;
    }
  } catch {
    // check failed
  }

  let languagesInconsistency = false;
  try {
    if (navigator.languages && navigator.languages.length === 0) {
      languagesInconsistency = true;
    }
  } catch {
    // check failed
  }

  let webglInconsistency = false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const renderer = gl.getParameter(gl.RENDERER);
      const vendor = gl.getParameter(gl.VENDOR);
      if (
        renderer === "Google SwiftShader" ||
        (vendor === "Google Inc." && renderer.includes("SwiftShader"))
      ) {
        webglInconsistency = true;
      }
    }
  } catch {
    // check failed
  }

  const checks = [
    webdriver,
    phantom,
    nightmare,
    selenium,
    domAutomation,
    headlessChrome,
    puppeteer,
    pluginsInconsistency,
    languagesInconsistency,
    webglInconsistency,
  ];
  const score = checks.filter(Boolean).length / checks.length;

  return {
    webdriver,
    phantom,
    nightmare,
    selenium,
    domAutomation,
    headlessChrome,
    puppeteer,
    pluginsInconsistency,
    languagesInconsistency,
    webglInconsistency,
    score,
  };
}

export class FingerprintCollector {
  private cachedFingerprint: DeviceFingerprint | null = null;

  async collect(): Promise<DeviceFingerprint> {
    if (this.cachedFingerprint) return this.cachedFingerprint;

    const [canvas, audio, webrtc] = await Promise.all([
      Promise.resolve(collectCanvas()),
      collectAudio(),
      collectWebRTC(),
    ]);

    const webgl = collectWebGL();
    const screen = collectScreen();
    const browser = collectBrowser();
    const fonts = collectFonts();
    const storage = collectStorage();
    const timing = collectTiming();
    const automation = collectAutomation();

    const signalData = JSON.stringify({
      canvas: canvas.hash,
      emojiCanvas: canvas.emojiHash,
      webgl: webgl.hash,
      audio: audio.hash,
      screen: [
        screen.width,
        screen.height,
        screen.colorDepth,
        screen.pixelRatio,
      ],
      browser: [
        browser.userAgent,
        browser.platform,
        browser.language,
        browser.hardwareConcurrency,
        browser.deviceMemory,
        browser.maxTouchPoints,
        browser.vendor,
        browser.productSub,
      ],
      fonts: fonts.detected,
      storage: Object.values(storage),
      timing: [
        timing.timezoneOffset,
        timing.timezone,
        timing.performancePrecision,
      ],
    });

    const hash = await sha256(signalData);
    const id = "fp_" + hash.substring(0, 16);

    this.cachedFingerprint = {
      id,
      canvas,
      webgl,
      audio,
      screen,
      browser,
      fonts,
      webrtc,
      storage,
      timing,
      automation,
    };

    return this.cachedFingerprint;
  }

  invalidate(): void {
    this.cachedFingerprint = null;
  }
}
