# High Impact: Warm Playwright Browser Reuse

**Priority:** High
**Impact Areas:** Performance, reliability, resource efficiency

## Problem

`PlaywrightProvider.capture()` in `src/services/screenshot.ts` imports Playwright and launches a brand new Chromium process on every capture:

```typescript
const playwright = await import('playwright');
const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

At the same time, `capture.ts` creates a fresh provider inside `_generateImage()` for every generation:

```typescript
const provider = createScreenshotProvider();
const pngBuffer = await provider.capture(url, WIDTH, HEIGHT);
```

That means every cron run and every manual `POST /api/refresh` pays the full browser startup cost even though the app only captures one fixed 800x480 page. On a small home server or Raspberry Pi style host, Chromium launch dominates the runtime, adds memory spikes, and makes overlapping refresh requests more likely to bunch up behind expensive cold starts.

## Solution

### 1. Add a shared browser manager in `src/services/screenshot.ts`

Keep one warm Chromium instance alive between captures and reuse it for new contexts/pages.

```typescript
import type { Browser, BrowserContext } from 'playwright';

let sharedBrowser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
    if (sharedBrowser?.isConnected()) {
        return sharedBrowser;
    }

    if (!browserPromise) {
        browserPromise = (async () => {
            const playwright = await import('playwright');
            const browser = await playwright.chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            sharedBrowser = browser;
            browser.on('disconnected', () => {
                sharedBrowser = null;
                browserPromise = null;
            });
            return browser;
        })();
    }

    return browserPromise;
}
```

This keeps the expensive process launch off the hot path while still allowing each screenshot to use an isolated page or browser context.

### 2. Reuse the browser safely with a fresh context per capture

Do not reuse the same page across runs. Reuse only the browser process, then create and dispose a short-lived context for isolation.

```typescript
async capture(url: string, width: number, height: number): Promise<Buffer> {
    const browser = await getSharedBrowser();
    const context = await browser.newContext({ viewport: { width, height } });

    try {
        const page = await context.newPage();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS });
        if (response && response.status() >= 500) {
            throw new Error(`Server returned ${response.status()}`);
        }

        await page.waitForFunction(
            () => (document.body as HTMLElement).dataset.loaded === 'true',
            { timeout: DATA_LOAD_WAIT_MS }
        ).catch(() => console.warn('[capture] Data load timeout, proceeding with current content'));

        return await page.screenshot({ type: 'png', fullPage: false });
    } finally {
        await context.close();
    }
}
```

This preserves the current page-ready behavior without leaking cookies, storage, or JS state between captures.

### 3. Add idle shutdown and self-healing

Keep the browser warm for a configurable idle window, then close it automatically. If Chromium crashes, clear the shared state and recreate it on the next request.

```typescript
const PLAYWRIGHT_IDLE_CLOSE_MS = parseInt(process.env.PLAYWRIGHT_IDLE_CLOSE_MS || '300000', 10);
let idleTimer: NodeJS.Timeout | null = null;

function scheduleBrowserClose(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
        if (sharedBrowser) {
            await sharedBrowser.close();
        }
        sharedBrowser = null;
        browserPromise = null;
    }, PLAYWRIGHT_IDLE_CLOSE_MS);
}
```

Call `scheduleBrowserClose()` after each successful or failed capture so the process does not live forever on idle systems.

## Files to Change

| File | Change |
| ---- | ------ |
| `src/services/screenshot.ts` | Add shared Chromium lifecycle management, per-capture contexts, and idle shutdown |
| `src/utils/constants.ts` | Add a default idle-close timeout constant if the project wants it centralized |
| `tests/capture.test.js` | Assert repeated captures do not relaunch Chromium on every call |
| `README.md` | Document the new warm-browser behavior and optional timeout override |

## Verification

- Two sequential `generateImage()` calls reuse the same Chromium process while still creating separate browser contexts.
- If Chromium disconnects unexpectedly, the next capture recreates the browser and still succeeds.
- With `PLAYWRIGHT_IDLE_CLOSE_MS` set low in a test, the browser closes after inactivity and a later capture starts a new instance.
- `pnpm test` passes with new coverage for the browser lifecycle behavior.
