# Medium Impact: Temperature History Sparkline

**Priority:** Medium
**Impact Areas:** Dashboard informativeness, trend awareness, e-paper value

## Problem

The dashboard currently shows only the current indoor and outdoor temperatures as point-in-time values. There is no way to see whether the temperature is rising or falling, or how it has changed over the past hours. For an e-paper display that refreshes infrequently, trend context is especially valuable — a single number like "21°C" communicates far less than "21°C and rising".

## Solution

### 1. Maintain a rolling temperature buffer in `src/services/data.ts`

Store the last 96 samples (24 hours at 15-minute intervals) for both indoor and outdoor temperature. Append a reading after every successful data fetch:

```typescript
const HISTORY_MAX_SAMPLES = 96; // 24h at 15-min intervals

interface TemperatureSample {
    timestamp: number; // Unix ms
    outdoor: number | null;
    indoor: number | null;
}

let temperatureHistory: TemperatureSample[] = [];

function recordTemperatureSample(weather: WeatherData | null, indoor: IndoorData | null): void {
    temperatureHistory.push({
        timestamp: Date.now(),
        outdoor: weather?.outdoor?.current ?? null,
        indoor: indoor?.current ?? null,
    });
    if (temperatureHistory.length > HISTORY_MAX_SAMPLES) {
        temperatureHistory.shift();
    }
}
```

Call `recordTemperatureSample()` at the end of `fetchAllData()` whenever new data is fetched.

### 2. Expose history via `GET /api/history`

Add a new endpoint in `server.ts`:

```typescript
app.get('/api/history', withErrorHandling('Error fetching history', async (_req, res) => {
    res.json({
        samples: getTemperatureHistory(),
        maxSamples: HISTORY_MAX_SAMPLES,
    });
}));
```

Example response:

```json
{
  "samples": [
    { "timestamp": 1705305600000, "outdoor": 3.2, "indoor": 21.4 },
    { "timestamp": 1705306500000, "outdoor": 3.5, "indoor": 21.5 }
  ],
  "maxSamples": 96
}
```

### 3. Render a sparkline on the dashboard (`dashboard-web/`)

Add a small SVG sparkline below the temperature gauges in `index.html`. In `script.js`, fetch `/api/history` and draw the line:

```javascript
async function renderTemperatureSparkline(samples, elementId, key) {
    const values = samples.map(s => s[key]).filter(v => v !== null);
    if (values.length < 2) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const W = 120, H = 30;

    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * W;
        const y = H - ((v - min) / range) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const svg = document.getElementById(elementId);
    if (svg) svg.setAttribute('points', points);
}
```

### 4. Persist history to disk

Write `output/temperature-history.json` after each sample is recorded, and restore it on startup (same pattern as cache persistence in `06-data-persistence.md`), so trend data survives restarts.

## Files to Change

| File | Change |
|------|--------|
| `src/services/data.ts` | Add `temperatureHistory` buffer, `recordTemperatureSample()`, `getTemperatureHistory()` |
| `server.ts` | Add `GET /api/history` endpoint |
| `dashboard-web/index.html` | Add `<polyline>` SVG elements for outdoor and indoor sparklines |
| `dashboard-web/script.js` | Fetch `/api/history` and call `renderTemperatureSparkline()` |
| `tests/data.test.js` | Add tests for history buffer (max size, null filtering) |
| `tests/server.test.js` | Add test for `GET /api/history` response shape |

## Verification

- After the first data fetch, `/api/history` returns a non-empty `samples` array.
- After 97+ fetches, `samples.length` stays at `96` (oldest entry dropped).
- The sparkline SVG polyline updates in the browser on each `/api/data` refresh.
- With only 1 sample, no sparkline is rendered (avoids division-by-zero).
- History is restored from disk after a server restart.
