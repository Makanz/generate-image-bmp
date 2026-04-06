# High Impact: Browserless Data-Load Parity with Playwright

**Priority:** High
**Impact Areas:** Reliability, screenshot correctness, e-paper rendering accuracy

## Problem

The two screenshot providers in `src/services/screenshot.ts` have a critical behavioral difference in how they wait for the dashboard to finish rendering.

`PlaywrightProvider.capture()` explicitly waits for `document.body.dataset.loaded === 'true'` before taking the screenshot:

```typescript
await page.waitForFunction(
    () => (document.body as HTMLElement).dataset.loaded === 'true',
    { timeout: DATA_LOAD_WAIT_MS }
).catch(() => console.warn('[capture] Data load timeout, proceeding with current content'));
```

`BrowserlessProvider.capture()` only waits for `networkidle0`:

```typescript
const body = {
    url,
    options: { type: 'png', fullPage: false },
    viewport: { width, height },
    gotoOptions: { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT_MS }
    // No waitForFunction — data-loaded flag is never checked
};
```

The `fetchData()` function in `dashboard-web/script.ts` makes an async `fetch('/api/data')` call after page load and only sets `document.body.dataset.loaded = 'true'` after rendering the response. Because the `/api/data` request completes after `networkidle0` is reached (from the HTML/CSS/JS loading), `networkidle0` is not a reliable proxy for data being rendered. The Browserless screenshot may capture placeholder text ("Laddar…") instead of real weather, calendar, and lunch data.

## Solution

### 1. Add `waitForFunction` to the Browserless request body

The Browserless REST API v2 `/screenshot` endpoint supports a `waitForFunction` option that evaluates a JavaScript expression in the page context before capturing:

```typescript
const body = {
    url,
    options: { type: 'png', fullPage: false },
    viewport: { width, height },
    gotoOptions: { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT_MS },
    waitForFunction: {
        fn: "() => document.body.dataset.loaded === 'true'",
        timeout: DATA_LOAD_WAIT_MS,
    },
};
```

### 2. Add a `BrowserlessRequestBody` interface in `screenshot.ts`

Make the request body typed to prevent silent omissions:

```typescript
interface BrowserlessRequestBody {
    url: string;
    options: { type: string; fullPage: boolean };
    viewport: { width: number; height: number };
    gotoOptions: { waitUntil: string; timeout: number };
    waitForFunction?: {
        fn: string;
        timeout: number;
    };
}
```

### 3. Preserve the existing timeout-fallback behaviour

Mirror the Playwright provider: if `waitForFunction` times out (e.g., the data fetch to an n8n webhook is slow), Browserless should proceed with whatever content is available rather than throwing a hard error. Wrap the request in a try/catch that falls back to a screenshot without `waitForFunction`:

```typescript
async capture(url: string, width: number, height: number): Promise<Buffer> {
    const browserlessUrl = process.env.BROWSERLESS_URL;
    const token = process.env.BROWSERLESS_TOKEN;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Basic ${Buffer.from(token).toString('base64')}`;
    }

    const body: BrowserlessRequestBody = {
        url,
        options: { type: 'png', fullPage: false },
        viewport: { width, height },
        gotoOptions: { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT_MS },
        waitForFunction: {
            fn: "() => document.body.dataset.loaded === 'true'",
            timeout: DATA_LOAD_WAIT_MS,
        },
    };

    console.log(`[capture] Using Browserless REST API at ${browserlessUrl}/screenshot`);
    try {
        const response = await axios.post(`${browserlessUrl}/screenshot`, body, {
            headers,
            responseType: 'arraybuffer',
            timeout: BROWSERLESS_TIMEOUT_MS,
        });
        return Buffer.from(response.data);
    } catch (err: unknown) {
        // Browserless may reject waitForFunction if unsupported; fall back without it
        handleApiError('[capture] Browserless waitForFunction failed, retrying without it', err);
        const fallbackBody = { ...body };
        delete fallbackBody.waitForFunction;
        const response = await axios.post(`${browserlessUrl}/screenshot`, fallbackBody, {
            headers,
            responseType: 'arraybuffer',
            timeout: BROWSERLESS_TIMEOUT_MS,
        });
        return Buffer.from(response.data);
    }
}
```

## Files to Change

| File | Change |
|------|--------|
| `src/services/screenshot.ts` | Add `waitForFunction` to `BrowserlessProvider.capture()` request body; add `BrowserlessRequestBody` interface; add fallback on rejection |
| `tests/capture.test.js` | Add test: mock Browserless request body includes `waitForFunction.fn` targeting `dataset.loaded` |

## Verification

- With `BROWSERLESS_URL` set and a mock Browserless server, the outgoing request body contains `waitForFunction.fn === "() => document.body.dataset.loaded === 'true'"`.
- If the Browserless endpoint rejects the `waitForFunction` field (returns a non-2xx response), the provider retries without `waitForFunction` and still returns a valid PNG buffer.
- Screenshots captured via Browserless show rendered temperature, calendar, and lunch data — not "Laddar…" placeholders.
- `pnpm test` passes with no regressions.
