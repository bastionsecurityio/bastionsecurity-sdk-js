import type {
  BehavioralProfile,
  MouseMetrics,
  KeyboardMetrics,
  ScrollMetrics,
  TouchMetrics,
} from "./types";

interface Point {
  x: number;
  y: number;
  t: number;
}

interface KeyEvent {
  key: string;
  downAt: number;
  upAt: number;
}

interface ScrollEvent {
  y: number;
  t: number;
}

interface TouchEvent2 {
  x: number;
  y: number;
  t: number;
  pressure: number;
  ended: number;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function shannonEntropy(values: number[], binCount: number): number {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 0;
  const binSize = (max - min) / binCount;
  const bins = new Array(binCount).fill(0) as number[];
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binSize), binCount - 1);
    bins[idx]++;
  }
  let entropy = 0;
  for (const count of bins) {
    if (count === 0) continue;
    const p = count / values.length;
    entropy -= p * Math.log2(p);
  }
  return entropy / Math.log2(binCount);
}

export class BehavioralCollector {
  private mousePoints: Point[] = [];
  private clickTimes: number[] = [];
  private keyEvents: KeyEvent[] = [];
  private pendingKeys: Map<string, number> = new Map();
  private pasteCount = 0;
  private scrollEvents: ScrollEvent[] = [];
  private touchEvents: TouchEvent2[] = [];
  private startTime = 0;
  private monitoring = false;
  private lastMouseTime = 0;

  getSignals() {
    const keys = this.keyEvents.slice(-256).sort((a, b) => a.downAt - b.downAt);
    return {
      mouse_movements: this.mousePoints.slice(-256).map(p => ({...p, type: 'move'})),
      keystrokes: keys.map((k, i) => ({key_code: 0, hold_time: k.upAt-k.downAt, interval: i ? k.downAt-keys[i-1]!.downAt : 0, t: k.downAt})),
      scroll_events: this.scrollEvents.slice(-256).map((s,i,a) => ({delta_y: i ? s.y-a[i-1]!.y : 0,t:s.t})),
      touch_events: this.touchEvents.slice(-256).map(t => ({x:t.x,y:t.y,t:t.t,force:t.pressure})),
      time_on_page_ms: this.startTime ? (this.monitoring ? performance.now() : this.stoppedAt)-this.startTime : 0,
      form_interactions: this.formInteractions, clipboard_events: this.pasteCount,
    };
  }
  private stoppedAt = 0;
  private formInteractions = 0;
  private onFocus = (e: FocusEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) this.formInteractions++;
  };
  private onMouseMove = (e: MouseEvent): void => {
    const now = performance.now();
    if (now - this.lastMouseTime < 16) return; // ~60fps throttle
    this.lastMouseTime = now;
    this.mousePoints.push({ x: e.clientX, y: e.clientY, t: now });
    if(this.mousePoints.length>256)this.mousePoints.shift();
  };

  private onClick = (): void => {
    this.clickTimes.push(performance.now());
    if (this.clickTimes.length > 256) this.clickTimes.shift();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.pendingKeys.has(e.code) && this.pendingKeys.size < 64) {
      this.pendingKeys.set(e.code, performance.now());
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const downAt = this.pendingKeys.get(e.code);
    if (downAt !== undefined) {
      this.keyEvents.push({ key: e.code, downAt, upAt: performance.now() });
      this.pendingKeys.delete(e.code);
      this.keyEvents.sort((a,b) => a.downAt-b.downAt);
      if (this.keyEvents.length > 256) this.keyEvents.shift();
    }
  };

  private onPaste = (): void => {
    this.pasteCount++;
  };

  private onScroll = (): void => {
    this.scrollEvents.push({ y: window.scrollY, t: performance.now() });
    if (this.scrollEvents.length > 256) this.scrollEvents.shift();
  };

  private onTouchStart = (e: globalThis.TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.touchEvents.push({
        x: touch.clientX,
        y: touch.clientY,
        t: performance.now(),
        pressure: touch.force || 0,
        ended: 0,
      });
      if (this.touchEvents.length > 256) this.touchEvents.shift();
    }
  };

  private onTouchEnd = (): void => {
    const now = performance.now();
    for (let i = this.touchEvents.length - 1; i >= 0; i--) {
      if (this.touchEvents[i].ended === 0) {
        this.touchEvents[i].ended = now;
      }
    }
  };

  start(): void {
    if (this.monitoring) return;
    this.monitoring = true;
    if (!this.startTime) this.startTime = performance.now();
    document.addEventListener("focusin", this.onFocus);

    document.addEventListener("mousemove", this.onMouseMove, { passive: true });
    document.addEventListener("click", this.onClick, { passive: true });
    document.addEventListener("keydown", this.onKeyDown, { passive: true });
    document.addEventListener("keyup", this.onKeyUp, { passive: true });
    document.addEventListener("paste", this.onPaste, { passive: true });
    window.addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("touchstart", this.onTouchStart, {
      passive: true,
    });
    document.addEventListener("touchend", this.onTouchEnd, { passive: true });
  }

  stop(): void {
    if (!this.monitoring) return;
    this.monitoring = false;
    this.stoppedAt = performance.now();
    this.pendingKeys.clear();
    document.removeEventListener("focusin", this.onFocus);

    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("paste", this.onPaste);
    window.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("touchstart", this.onTouchStart);
    document.removeEventListener("touchend", this.onTouchEnd);
  }

  private computeMouseMetrics(): MouseMetrics {
    const points = this.mousePoints;
    if (points.length < 2) {
      return {
        totalDistance: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        straightLineRatio: 0,
        entropy: 0,
        teleportCount: 0,
        clickCount: this.clickTimes.length,
        avgClickInterval: 0,
      };
    }

    let totalDistance = 0;
    const speeds: number[] = [];
    let straightSegments = 0;
    let totalSegments = 0;
    let teleportCount = 0;
    const angles: number[] = [];

    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = points[i].t - points[i - 1].t;

      totalDistance += dist;
      if (dt > 0) speeds.push(dist / dt);

      // teleportation: > 500px in one frame
      if (dist > 500 && dt < 20) teleportCount++;

      if (i >= 2) {
        const prevDx = points[i - 1].x - points[i - 2].x;
        const prevDy = points[i - 1].y - points[i - 2].y;
        const angle = Math.atan2(dy, dx) - Math.atan2(prevDy, prevDx);
        angles.push(Math.abs(angle));

        // straight line: angle deviation < 0.05 radians
        if (Math.abs(angle) < 0.05) straightSegments++;
        totalSegments++;
      }
    }

    const clickIntervals: number[] = [];
    for (let i = 1; i < this.clickTimes.length; i++) {
      clickIntervals.push(this.clickTimes[i] - this.clickTimes[i - 1]);
    }

    return {
      totalDistance,
      avgSpeed:
        speeds.length > 0
          ? speeds.reduce((a, b) => a + b, 0) / speeds.length
          : 0,
      maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
      straightLineRatio:
        totalSegments > 0 ? straightSegments / totalSegments : 0,
      entropy: shannonEntropy(angles, 20),
      teleportCount,
      clickCount: this.clickTimes.length,
      avgClickInterval:
        clickIntervals.length > 0
          ? clickIntervals.reduce((a, b) => a + b, 0) / clickIntervals.length
          : 0,
    };
  }

  private computeKeyboardMetrics(): KeyboardMetrics {
    if (this.keyEvents.length < 2) {
      return {
        avgInterKeyInterval: 0,
        interKeyVariance: 0,
        avgHoldDuration: 0,
        holdVariance: 0,
        pasteCount: this.pasteCount,
        typingSpeed: 0,
      };
    }

    const intervals: number[] = [];
    for (let i = 1; i < this.keyEvents.length; i++) {
      intervals.push(this.keyEvents[i].downAt - this.keyEvents[i - 1].downAt);
    }

    const holds = this.keyEvents.map((k) => k.upAt - k.downAt);

    const totalTime =
      this.keyEvents[this.keyEvents.length - 1].upAt - this.keyEvents[0].downAt;

    return {
      avgInterKeyInterval:
        intervals.reduce((a, b) => a + b, 0) / intervals.length,
      interKeyVariance: stddev(intervals),
      avgHoldDuration: holds.reduce((a, b) => a + b, 0) / holds.length,
      holdVariance: stddev(holds),
      pasteCount: this.pasteCount,
      typingSpeed:
        totalTime > 0 ? (this.keyEvents.length / totalTime) * 60000 : 0,
    };
  }

  private computeScrollMetrics(): ScrollMetrics {
    if (this.scrollEvents.length < 2) {
      return {
        totalScrollDistance: 0,
        avgVelocity: 0,
        jitter: 0,
        directionChanges: 0,
        jumpCount: 0,
      };
    }

    let totalDistance = 0;
    const velocities: number[] = [];
    let directionChanges = 0;
    let jumpCount = 0;
    let lastDirection = 0;

    for (let i = 1; i < this.scrollEvents.length; i++) {
      const dy = this.scrollEvents[i].y - this.scrollEvents[i - 1].y;
      const dt = this.scrollEvents[i].t - this.scrollEvents[i - 1].t;
      const absDy = Math.abs(dy);
      totalDistance += absDy;

      if (dt > 0) velocities.push(absDy / dt);

      if (absDy > 500 && dt < 50) jumpCount++;

      const direction = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      if (
        direction !== 0 &&
        direction !== lastDirection &&
        lastDirection !== 0
      ) {
        directionChanges++;
      }
      if (direction !== 0) lastDirection = direction;
    }

    return {
      totalScrollDistance: totalDistance,
      avgVelocity:
        velocities.length > 0
          ? velocities.reduce((a, b) => a + b, 0) / velocities.length
          : 0,
      jitter: stddev(velocities),
      directionChanges,
      jumpCount,
    };
  }

  private computeTouchMetrics(): TouchMetrics {
    if (this.touchEvents.length === 0) {
      return { avgPressure: 0, multiTouchCount: 0, avgTouchDuration: 0 };
    }

    const pressures = this.touchEvents
      .map((t) => t.pressure)
      .filter((p) => p > 0);
    const durations = this.touchEvents
      .filter((t) => t.ended > 0)
      .map((t) => t.ended - t.t);

    let multiTouchCount = 0;
    const byTime = [...this.touchEvents].sort((a, b) => a.t - b.t);
    for (let i = 1; i < byTime.length; i++) {
      if (byTime[i].t - byTime[i - 1].t < 10) multiTouchCount++;
    }

    return {
      avgPressure:
        pressures.length > 0
          ? pressures.reduce((a, b) => a + b, 0) / pressures.length
          : 0,
      multiTouchCount,
      avgTouchDuration:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0,
    };
  }

  getProfile(): BehavioralProfile {
    const mouse = this.computeMouseMetrics();
    const keyboard = this.computeKeyboardMetrics();
    const scroll = this.computeScrollMetrics();
    const touch = this.computeTouchMetrics();

    const sessionDurationMs =
      this.startTime > 0 ? (this.monitoring ? performance.now() : this.stoppedAt) - this.startTime : 0;
    const interactionCount =
      this.mousePoints.length +
      this.keyEvents.length +
      this.scrollEvents.length +
      this.touchEvents.length;

    // Bot detection heuristics
    let botScore = 0;
    let signalCount = 0;

    if (mouse.totalDistance > 0) {
      signalCount++;
      if (mouse.straightLineRatio > 0.8) botScore += 1;
      if (mouse.entropy < 0.2) botScore += 1;
      if (mouse.teleportCount > 2) botScore += 1;
    }

    if (keyboard.avgInterKeyInterval > 0) {
      signalCount++;
      // Too regular typing (CV < 0.1)
      if (
        keyboard.avgInterKeyInterval > 0 &&
        keyboard.interKeyVariance / keyboard.avgInterKeyInterval < 0.1
      ) {
        botScore += 1;
      }
      // Impossibly fast typing (> 900 WPM)
      if (keyboard.typingSpeed > 4500) botScore += 1;
    }

    if (scroll.totalScrollDistance > 0) {
      signalCount++;
      if (scroll.jitter < 0.01 && scroll.totalScrollDistance > 1000)
        botScore += 1;
    }

    if (
      sessionDurationMs > 0 &&
      sessionDurationMs < 500 &&
      interactionCount > 10
    ) {
      botScore += 1;
    }

    const maxPossible = Math.max(signalCount * 2 + 1, 1);
    const isBotLikely = botScore / maxPossible > 0.4;
    const confidence = signalCount > 0 ? Math.min(interactionCount / 50, 1) : 0;

    return {
      mouseEntropy: mouse.entropy,
      mouseVelocityStd: stddev(
        this.mousePoints.length > 1
          ? this.mousePoints.slice(1).map((p, i) => {
              const prev = this.mousePoints[i];
              const dx = p.x - prev.x;
              const dy = p.y - prev.y;
              const dt = p.t - prev.t;
              return dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt : 0;
            })
          : [],
      ),
      straightLineRatio: mouse.straightLineRatio,
      keystrokeVariance: keyboard.interKeyVariance,
      avgKeyHoldMs: keyboard.avgHoldDuration,
      scrollJitter: scroll.jitter,
      interactionCount,
      sessionDurationMs,
      isBotLikely,
      confidence,
      mouse,
      keyboard,
      scroll,
      touch,
    };
  }

  reset(): void {
    this.mousePoints = [];
    this.clickTimes = [];
    this.keyEvents = [];
    this.pendingKeys.clear();
    this.pasteCount = 0;
    this.formInteractions = 0;
    this.startTime = this.monitoring ? performance.now() : 0;
    this.scrollEvents = [];
    this.touchEvents = [];
  }
}
