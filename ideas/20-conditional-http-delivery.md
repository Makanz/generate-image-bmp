# High Impact: Conditional HTTP Delivery for BMP and API Responses

**Priority:** High
**Impact Areas:** Performance, bandwidth efficiency, ESP32 battery life

## Problem

The dashboard already has the ingredients needed for cache-aware delivery, but `server.ts` still returns full responses on every poll:

```typescript
app.get('/dashboard.bmp', (_req: Request, res: Response) => {
    res.sendFile(path.join(APP_ROOT, 'output', 'dashboard.bmp'));
});

app.get('/api/data', withErrorHandling('Error fetching data', async (_req, res) => {
    const data = await fetchAllData();
    res.json(data);
}));
```

At the same time, the project already computes image-level checksums in the change-detection flow:

```typescript
const changes = await getChanges();
res.json(changes);
```

And the browser preview polls every 5 minutes in `dashboard-web/script.ts`:

```typescript
setInterval(() => {
    updateDate();
    void fetchData();
}, 5 * 60 * 1000);
```

So both the ESP32 and the browser keep downloading full payloads even when nothing changed. For an e-paper dashboard whose content updates on a slow interval, that is unnecessary network traffic and avoidable battery usage.

## Solution

### 1. Add ETag support to `/dashboard.bmp` and `/dashboard.previous.bmp`

Use the current BMP checksum as the ETag and return `304 Not Modified` when the client already has the latest image.

```typescript
app.get('/dashboard.bmp', withErrorHandling('Error serving dashboard.bmp', async (req, res) => {
    const imagePath = path.join(APP_ROOT, 'output', 'dashboard.bmp');
    const checksum = await computeChecksum(imagePath);

    if (checksum) {
        res.set('ETag', checksum);
        if (req.headers['if-none-match'] === checksum) {
            res.status(304).end();
            return;
        }
    }

    res.sendFile(imagePath);
}));
```

This gives the ESP32 a lightweight "nothing changed" path without inventing a custom protocol.

### 2. Add a stable data ETag for `/api/data`

The aggregated JSON response already has a deterministic shape, so the server can hash the serialized payload and avoid resending identical content.

```typescript
import crypto from 'crypto';

function createJsonEtag(value: unknown): string {
    const body = JSON.stringify(value);
    return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

app.get('/api/data', withErrorHandling('Error fetching data', async (req, res) => {
    const data = await fetchAllData();
    const etag = createJsonEtag(data);

    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
    }

    res.json(data);
}));
```

This is especially useful for the browser preview, which otherwise reparses and rerenders identical data.

### 3. Surface client guidance for ESP32 and browser callers

Document that clients should store the last ETag and send `If-None-Match` on the next request. For the browser preview, keep the existing polling interval but skip DOM work on `304`.

```typescript
async function fetchData(): Promise<void> {
    const response = await fetch('/api/data', { cache: 'no-cache' });
    if (response.status === 304) {
        markDataLoaded();
        return;
    }

    const data: AllDataResponse = await response.json();
    updateTemperature(data.weather, data.indoor);
    updateSchoolLunch(data.lunch);
    updateCalendar(data.calendar);
    markDataLoaded();
}
```

For the ESP32 side, the implementation can stay simple: store the last BMP ETag string and only download the body when the server returns `200`.

## Files to Change

| File | Change |
| ---- | ------ |
| `server.ts` | Add ETag handling and `304` responses for `/dashboard.bmp`, `/dashboard.previous.bmp`, and `/api/data` |
| `capture.ts` | Reuse existing checksum helpers for the image ETag path |
| `dashboard-web/script.ts` | Skip unnecessary rerender work when the server returns `304` |
| `README.md` | Document `If-None-Match` support for browser and ESP32 clients |
| `tests/server.test.js` | Add coverage for `ETag` headers and `304 Not Modified` responses |

## Verification

- The first `GET /dashboard.bmp` response includes an `ETag`, and a second request with `If-None-Match` returns `304`.
- `GET /api/data` returns `304` when the aggregated payload has not changed since the previous request.
- The browser preview keeps updating the clock, but skips a full data rerender when `/api/data` responds with `304`.
- An ESP32 client that stores the last image ETag avoids downloading the BMP body when the image is unchanged.
- `pnpm test` passes with new server coverage for conditional requests.
