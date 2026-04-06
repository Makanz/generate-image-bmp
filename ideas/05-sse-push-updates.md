# Medium Impact: Server-Sent Events for Push Notifications

**Priority:** Medium
**Impact Areas:** Reliability, ESP32 power efficiency, real-time responsiveness

## Problem

Both the ESP32 and the browser web client currently rely on polling or manual refresh to detect when a new `dashboard.bmp` is available. The ESP32 typically polls on a fixed interval (e.g., every 15 minutes), which means:

- The display can lag behind by up to one full interval even after the image was refreshed early (e.g., by `POST /api/refresh`).
- The ESP32 wastes power and bandwidth on requests that return unchanged data.
- There is no mechanism for the browser dashboard preview to auto-update without a page reload.

## Solution

### 1. Add a `GET /api/events` SSE endpoint in `server.ts`

Use the standard `text/event-stream` content type. Emit a `image-updated` event whenever a new BMP is successfully generated.

```typescript
const sseClients: Set<Response> = new Set();

app.get('/api/events', (_req: Request, res: Response) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    res.flushHeaders();

    sseClients.add(res);
    res.write('data: {"event":"connected"}\n\n');

    _req.on('close', () => sseClients.delete(res));
});

function notifyImageUpdated(): void {
    const payload = `data: ${JSON.stringify({ event: 'image-updated', timestamp: new Date().toISOString() })}\n\n`;
    for (const client of sseClients) {
        client.write(payload);
    }
}
```

### 2. Call `notifyImageUpdated()` after every successful image generation

In `generateImageWhenReady()` and the cron handler, call `notifyImageUpdated()` after `generateImage()` resolves:

```typescript
await generateImage();
notifyImageUpdated();
```

### 3. Subscribe from the browser preview (`script.js`)

```javascript
const evtSource = new EventSource('/api/events');
evtSource.onmessage = function(e) {
    const msg = JSON.parse(e.data);
    if (msg.event === 'image-updated') {
        // Reload the BMP preview image
        document.getElementById('bmp-preview').src = '/dashboard.bmp?t=' + Date.now();
    }
};
```

### 4. ESP32 usage

The ESP32 can optionally connect to `/api/events` over HTTP/1.1 and react to `image-updated` events to trigger an immediate fetch of `/dashboard.bmp`, replacing its fixed-interval poll.

## Files to Change

| File | Change |
|------|--------|
| `server.ts` | Add `GET /api/events` SSE endpoint; call `notifyImageUpdated()` after each generation |
| `dashboard-web/script.js` | Subscribe to `/api/events` and reload the BMP preview on `image-updated` |
| `tests/server.test.js` | Add tests for `/api/events` (connection established, event emitted after refresh) |

## Verification

- `GET /api/events` returns `Content-Type: text/event-stream` and keeps the connection open.
- After `POST /api/refresh`, connected SSE clients receive an `image-updated` event within 1–2 seconds.
- Multiple simultaneous SSE clients all receive the event.
- Closing the browser tab removes the client from `sseClients` (no memory leak).
