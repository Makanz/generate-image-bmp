# Refactoring Plan: SOLID & DRY Improvements

## Overview
Comprehensive refactoring to apply SOLID principles and eliminate DRY violations across the codebase.

---

## Phase 1: Foundation — Constants & Error Handler

### 1.1 Create `src/utils/constants.ts`
Extract all magic numbers and duplicated constants into a single source of truth:

```typescript
export const WIDTH = 800;
export const HEIGHT = 480;
export const HTTP_TIMEOUT_MS = 10000;
export const BROWSERLESS_TIMEOUT_MS = 45000;
export const PAGE_LOAD_TIMEOUT_MS = 30000;
export const DATA_LOAD_WAIT_MS = 10000;
export const GREYSCALE_THRESHOLD = 128;
export const MERGE_DISTANCE = 10;
export const SERVER_STARTUP_DELAY_MS = 5000;
export const WEATHER_FORECAST_START_INDEX = 1;
export const WEATHER_FORECAST_COUNT = 3;
export const DPI_PIXELS_PER_METER = 2835;
export const BITS_PER_DWORD = 32;
export const COLOR_TABLE_ENTRIES = 2;
export const COLOR_BLACK = 0x00000000;
export const COLOR_WHITE = 0x00FFFFFF;
export const TREND_THRESHOLD = 0.5;
export const UI_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const CAPABILITY_MEASURE_TEMPERATURE = 'measure_temperature';
export const LOCALE_SV = 'sv';
```

### 1.2 Create `src/utils/errors.ts`
Eliminate 11 duplicated error-handling blocks:

```typescript
export function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : 'Unknown error';
}

export function handleApiError(context: string, err: unknown): string {
    const message = getErrorMessage(err);
    console.error(`${context}:`, message);
    return message;
}
```

### 1.3 Create `src/utils/path.ts`
Eliminate duplicated `APP_ROOT` resolution:

```typescript
import path from 'path';

export function getAppRoot(): string {
    return __filename.endsWith('.ts') ? __dirname : path.join(__dirname, '..');
}
```

---

## Phase 2: Data Service — Factory Pattern & DRY

### 2.1 Refactor `src/services/data.ts`

**Replace 4 near-identical fetch functions with a factory:**

```typescript
function createWebhookFetcher<T>(
    sourceName: string,
    envVar: string,
    normalizer?: (raw: unknown) => T | null
) {
    return async (): Promise<T | null> => {
        const url = process.env[envVar];
        if (!url) {
            console.warn(`[data] ${envVar} not configured`);
            return null;
        }
        try {
            const response = await axios.get(url, { timeout: HTTP_TIMEOUT_MS });
            return normalizer ? normalizer(response.data) : response.data;
        } catch (err: unknown) {
            handleApiError(`[data] ${sourceName} fetch failed`, err);
            return null;
        }
    };
}

const fetchWeather = createWebhookFetcher('Weather', 'N8N_WEBHOOK_WEATHER', normalizeWeather);
const fetchCalendar = createWebhookFetcher<CalendarData>('Calendar', 'N8N_WEBHOOK_CALENDAR');
const fetchLunch = createWebhookFetcher<unknown[]>('Lunch', 'N8N_WEBHOOK_LUNCH');
const fetchIndoorWebhook = createWebhookFetcher('Indoor', 'N8N_WEBHOOK_INDOOR', normalizeIndoor);
```

**Simplify `fetchAllDataFresh`:**

```typescript
async function fetchAllDataFresh(): Promise<AllData> {
    (Object.keys(cache) as Array<keyof Cache>).forEach(key => {
        cache[key] = { data: null, timestamp: 0 };
    });
    return fetchAllData();
}
```

### 2.2 Fix `lunch: unknown[]` type
Create a proper `LunchData` interface to replace `unknown[]`.

---

## Phase 3: Capture — Strategy Pattern & Module Split

### 3.1 Create `src/services/screenshot.ts`
Introduce `ScreenshotProvider` interface for OCP/DIP:

```typescript
export interface ScreenshotProvider {
    capture(url: string, width: number, height: number): Promise<Buffer>;
}

export class BrowserlessProvider implements ScreenshotProvider {
    async capture(url: string, width: number, height: number): Promise<Buffer> {
        // ... current screenshotWithBrowserless logic using constants
    }
}

export class PlaywrightProvider implements ScreenshotProvider {
    async capture(url: string, width: number, height: number): Promise<Buffer> {
        // ... current screenshotWithPlaywright logic using constants
    }
}

export function createScreenshotProvider(): ScreenshotProvider {
    if (process.env.BROWSERLESS_URL) {
        return new BrowserlessProvider();
    }
    return new PlaywrightProvider();
}
```

### 3.2 Create `src/services/image-processing.ts`

```typescript
export async function processToGreyscale(
    input: string | Buffer,
    options: { width?: number; height?: number; resolveWithObject?: boolean } = {}
): Promise<Buffer | { data: Buffer; info: sharp.OutputInfo }> {
    // ... existing logic using GREYSCALE_THRESHOLD constant
}

export async function extractRegion(
    imagePath: string,
    left: number, top: number, width: number, height: number
): Promise<Buffer> {
    return sharp(imagePath).extract({ left, top, width, height }).png().toBuffer();
}
```

### 3.3 Create `src/services/change-detection.ts`

```typescript
export interface ChangeRegion {
    x: number; y: number; width: number; height: number;
}

export async function computeChecksum(filePath: string): Promise<string | null> {
    // ... existing logic
}

export async function detectChanges(
    currentPath: string, previousPath: string
): Promise<ChangeRegion[]> {
    // ... existing logic using constants
}

export function mergeRegions(regions: ChangeRegion[], distance: number): ChangeRegion[] {
    // ... existing logic
}

export async function getChanges(): Promise<ChangesResult> {
    // ... existing logic
}
```

### 3.4 Refactor `capture.ts` to Orchestrate
Keep `capture.ts` as the high-level orchestrator depending on abstractions:

```typescript
import { createScreenshotProvider } from './src/services/screenshot';
import { processToGreyscale } from './src/services/image-processing';
import { writeBmp } from './src/image/bmp-writer';
import { WIDTH, HEIGHT } from './src/utils/constants';
// ... imports for change detection

export async function generateImage(options: GenerateImageOptions = {}) {
    const provider = createScreenshotProvider();
    const pngBuffer = await provider.capture(url, WIDTH, HEIGHT);
    // ... rest using extracted modules
}
```

---

## Phase 4: Server — Clean Architecture

### 4.1 Refactor `server.ts`

**Extract error handler middleware:**

```typescript
function withErrorHandling(context: string, handler: (req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
        try {
            await handler(req, res);
        } catch (err: unknown) {
            const message = handleApiError(context, err);
            res.status(500).json({ error: message });
        }
    };
}
```

**Parameterize static file routes:**

```typescript
app.get('/output/:filename', (_req: Request, res: Response) => {
    const { filename } = req.params;
    const allowed = ['dashboard.png', 'dashboard.bmp', 'dashboard.previous.png'];
    if (!allowed.includes(filename)) {
        return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(path.join(APP_ROOT, 'output', filename));
});
```

**Extract retry logic to its own function:**

```typescript
async function ensureWeatherData(): Promise<void> {
    let weather = (await fetchAllData()).weather;
    for (let i = 0; i < WEATHER_ENSURE_RETRIES && (weather?.outdoor?.current == null); i++) {
        console.warn(`[server] Väderdata saknas, försöker hämta igen (${i + 1}/${WEATHER_ENSURE_RETRIES})...`);
        await sleep(WEATHER_ENSURE_DELAY_MS);
        weather = await fetchWeatherFresh();
    }
}
```

**Extract schedule handler:**

```typescript
async function scheduledImageGeneration(): Promise<void> {
    try {
        await fetchAllDataFresh();
        await generateImageWhenReady();
    } catch (err: unknown) {
        handleApiError('[cron] Image generation failed', err);
    }
}
```

---

## Phase 5: BMP Writer — Named Constants

### 5.1 Refactor `src/image/bmp-writer.ts`

Replace magic numbers with constants from `src/utils/constants.ts`:

```typescript
import {
    DPI_PIXELS_PER_METER, BITS_PER_DWORD, COLOR_TABLE_ENTRIES,
    COLOR_BLACK, COLOR_WHITE, GREYSCALE_THRESHOLD
} from '../utils/constants';

const FILE_HEADER_SIZE = 14;
const DIB_HEADER_SIZE = 40;
const COLOR_TABLE_ENTRY_SIZE = 4;
const COLOR_TABLE_SIZE = COLOR_TABLE_ENTRIES * COLOR_TABLE_ENTRY_SIZE;

// In writeBmp:
buf.writeInt32LE(DPI_PIXELS_PER_METER, pos); pos += 4;  // X resolution
buf.writeInt32LE(DPI_PIXELS_PER_METER, pos); pos += 4;  // Y resolution
buf.writeUInt32LE(COLOR_TABLE_ENTRIES, pos); pos += 4;  // colors used
buf.writeUInt32LE(COLOR_TABLE_ENTRIES, pos); pos += 4;  // colors important

buf.writeUInt32LE(COLOR_BLACK, pos); pos += 4;  // black entry
buf.writeUInt32LE(COLOR_WHITE, pos); pos += 4;  // white entry

// Pixel loop:
const rowBytes = Math.ceil(width / BITS_PER_DWORD) * 4;
if (gray >= GREYSCALE_THRESHOLD) byte |= (0x80 >> bit);
```

---

## Phase 6: Frontend — Module Split

### 6.1 Create `dashboard-web/formatters.js`
Extract date/time formatting, trend calculation, HTML escaping:

```javascript
const MONTHS_SV = ['JANUARI','FEBRUARI','MARS','APRIL','MAJ','JUNI','JULI','AUGUSTI','SEPTEMBER','OKTOBER','NOVEMBER','DECEMBER'];
const DAYS_SV = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
const TREND_THRESHOLD = 0.5;

function getTrend(current, previous) { ... }
function parseDate(dateStr) { ... }
function isSameDay(a, b) { ... }
function formatTime(datetimeStr) { ... }
function escapeHtml(text) { ... }
```

### 6.2 Create `dashboard-web/weather.js`
Extract temperature display and room chart:

```javascript
const prevTemps = { ute: null, inne: null };

function updateTempDisplay(elementId, value, trendKey) {
    const rounded = Math.round(value);
    const trend = getTrend(rounded, prevTemps[trendKey]);
    prevTemps[trendKey] = rounded;
    document.getElementById(`${elementId}-temp-val`).textContent = rounded;
    document.getElementById(`${elementId}-trend`).textContent = trend;
}

function updateTemperature(weather, indoor) {
    if (weather?.outdoor?.current != null) {
        updateTempDisplay('ute', weather.outdoor.current, 'ute');
        // forecast...
    }
    if (indoor?.current != null) {
        updateTempDisplay('inne', indoor.current, 'inne');
        renderRoomChart(indoor.rooms || []);
    }
}

function renderRoomChart(rooms) { ... }
```

### 6.3 Create `dashboard-web/calendar.js`
Extract calendar rendering:

```javascript
function renderCalendarEvents(events, containerId) { ... }

function filterEventsByDate(events, targetDate) {
    return events
        .filter(e => isSameDay(parseDate(e.datetime || e.date || ''), targetDate))
        .sort((a, b) => parseDate(a.datetime || a.date || '') - parseDate(b.datetime || b.date || ''));
}

function updateCalendar(data) {
    // ... uses filterEventsByDate for today and tomorrow
}
```

### 6.4 Create `dashboard-web/lunch.js`
Extract lunch rendering using shared `MONTHS_SV`/`DAYS_SV`:

```javascript
function updateSchoolLunch(data) {
    // ... uses imported MONTHS_SV, DAYS_SV instead of re-declaring
}
```

### 6.5 Refactor `dashboard-web/script.js`
Become the orchestrator:

```html
<script src="formatters.js"></script>
<script src="weather.js"></script>
<script src="calendar.js"></script>
<script src="lunch.js"></script>
<script src="script.js"></script>
```

```javascript
// script.js — now just orchestration
async function fetchData() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok || allDataEmpty(await response.json())) {
            generateMockData();
            markDataLoaded();
            return;
        }
        const data = await response.json();
        updateTemperature(data.weather, data.indoor);
        updateSchoolLunch(data.lunch);
        updateCalendar(data.calendar);
        markDataLoaded();
    } catch {
        generateMockData();
        markDataLoaded();
    }
}

updateDate();
fetchData();
setInterval(() => { updateDate(); fetchData(); }, UI_REFRESH_INTERVAL_MS);
```

---

## Phase 7: Homey — DRY Cleanup

### 7.1 Refactor `src/services/homey.ts`

**Consolidate axios.create calls:**

```typescript
function createHomeyClient(ip: string, token: string): AxiosInstance {
    return axios.create({
        baseURL: `http://${ip}/api`,
        headers: { Authorization: `Bearer ${token}` },
        timeout: HTTP_TIMEOUT_MS
    });
}

async function getClient(): Promise<AxiosInstance | null> {
    const ip = process.env.HOMEY_IP;
    if (!ip) return null;

    const token = process.env.HOMEY_TOKEN ?? await loginLocal(ip, process.env.HOMEY_USERNAME!, process.env.HOMEY_PASSWORD!);
    return token ? createHomeyClient(ip, token) : null;
}
```

**Extract average calculation:**

```typescript
function calculateAverage(rooms: Room[]): number {
    return rooms.reduce((sum, r) => sum + (r.temp as number), 0) / rooms.length;
}
```

---

## File Change Summary

| File | Action | Reason |
|---|---|---|
| `src/utils/constants.ts` | **NEW** | Centralize all magic numbers |
| `src/utils/errors.ts` | **NEW** | Shared error handling |
| `src/utils/path.ts` | **NEW** | Shared APP_ROOT resolution |
| `src/services/screenshot.ts` | **NEW** | ScreenshotProvider interface + implementations |
| `src/services/image-processing.ts` | **NEW** | Extracted from capture.ts |
| `src/services/change-detection.ts` | **NEW** | Extracted from capture.ts |
| `src/services/data.ts` | **MODIFY** | Factory pattern, DRY cleanup |
| `src/services/homey.ts` | **MODIFY** | DRY cleanup, constants |
| `src/image/bmp-writer.ts` | **MODIFY** | Replace magic numbers |
| `capture.ts` | **MODIFY** | Orchestrate via abstractions |
| `server.ts` | **MODIFY** | Error middleware, parameterized routes |
| `dashboard-web/formatters.js` | **NEW** | Extracted formatting utilities |
| `dashboard-web/weather.js` | **NEW** | Extracted weather display |
| `dashboard-web/calendar.js` | **NEW** | Extracted calendar rendering |
| `dashboard-web/lunch.js` | **NEW** | Extracted lunch rendering |
| `dashboard-web/script.js` | **MODIFY** | Orchestration only |
| `dashboard-web/index.html` | **MODIFY** | Add new script tags |

---

## Risk Mitigation

1. **Tests exist** — `tests/` directory has coverage for bmp-writer, capture, data, homey, server
2. **Run `npm test`** after each phase to verify no regressions
3. **Small commits** per phase for easy rollback
4. **No behavior changes** — purely structural refactoring
