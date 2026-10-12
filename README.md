# Bastion Security SDK

JavaScript SDK for integrating [Bastion Security](https://bastionsecurity.io) bot detection and fraud prevention into your web applications.

## Installation

```bash
npm install @bastionsecurity/sdk
```

Or include via script tag:

```html
<script src="https://cdn.bastionsecurity.io/sdk/bastion.js"></script>
```

## Quick Start

```javascript
import Bastion from '@bastionsecurity/sdk';

const bastion = new Bastion({
  siteKey: 'pk_live_your_site_key',
});

// Get a verification token
const token = await bastion.getToken();

// Send token to your backend for classification
const result = await bastion.classify(token);

console.log(result.verdict); // 'allow' | 'challenge' | 'block'
console.log(result.score);   // 0-100 risk score
```

## Features

- **Device Fingerprinting** — Canvas, WebGL, AudioContext, screen, hardware, and timezone signals
- **Behavioral Biometrics** — Mouse movement, keystroke dynamics, scroll patterns, touch gestures
- **Network Analysis** — Connection profiling and latency measurement
- **Proof-of-Work Challenges** — Automatic challenge solving for transparent bot mitigation
- **Event Tracking** — Custom event tracking tied to device identity

## API

### `new Bastion(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `siteKey` | `string` | — | **Required.** Your site's public key |
| `endpoint` | `string` | `https://api.bastionsecurity.io` | API endpoint |
| `debug` | `boolean` | `false` | Enable console logging |
| `monitorOnInit` | `boolean` | `true` | Start behavioral monitoring immediately |

### Methods

| Method | Returns | Description |
|---|---|---|
| `getToken()` | `Promise<string>` | Collect signals and generate a verification token |
| `classify(token)` | `Promise<ClassifyResult>` | Submit token for risk classification |
| `track(event, data)` | `void` | Track a custom event |
| `startMonitoring()` | `void` | Start behavioral signal collection |
| `stopMonitoring()` | `void` | Stop behavioral signal collection |
| `destroy()` | `void` | Clean up all listeners and timers |

### `ClassifyResult`

```typescript
{
  verdict: 'allow' | 'challenge' | 'block';
  score: number;        // 0-100 risk score
  signals: string[];    // Triggered signal names
  action: string;       // Recommended action
  session_id: string;   // Session identifier
}
```

## Framework Integration

### Next.js

```tsx
'use client';
import { useEffect } from 'react';
import Bastion from '@bastionsecurity/sdk';

export function BastionProvider({ children }) {
  useEffect(() => {
    const bastion = new Bastion({ siteKey: process.env.NEXT_PUBLIC_BASTION_SITE_KEY });
    return () => bastion.destroy();
  }, []);
  return <>{children}</>;
}
```

### Script Tag

```html
<script src="https://cdn.bastionsecurity.io/sdk/bastion.js"></script>
<script>
  var bastion = new Bastion({ siteKey: 'pk_live_your_site_key' });
  
  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var token = await bastion.getToken();
    document.getElementById('bastion-token').value = token;
    this.submit();
  });
</script>
```

## Build

```bash
npm install
npm run build
```

Outputs:
- `dist/bastion.js` — UMD bundle (script tag)
- `dist/bastion.esm.js` — ES module

## License

MIT — © 2024 Bastion Security
