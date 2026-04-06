# High Impact: Concurrent Image Generation Guard

**Priority:** High
**Impact Areas:** Reliability, data integrity, resource efficiency

## Problem

`generateImage()` in `capture.ts` has no concurrency guard. Both the `node-cron` job and `POST /api/refresh` in `server.ts` call `generateImageWhenReady()` independently:

```typescript
// server.ts – cron
cron.schedule(`*/${REFRESH_INTERVAL} * * * *`, async () => {
    await scheduledImageGeneration(); // calls generateImageWhenReady()
});

// server.ts – manual refresh
app.post('/api/refresh', withErrorHandling('Image generation failed', async (_req, res) => {
    await fetchAllDataFresh();
    await generateImageWhenReady();
```

If two calls overlap — e.g. a slow Playwright launch is still running when the cron fires — both instances execute the copy-then-write sequence on the same files concurrently:

```typescript
// Both instances reach this simultaneously:
await fs.copyFile(outputBmp, previousBmp);  // race on dashboard.previous.bmp
// ...
await writeBmp(..., outputBmp);             // race on dashboard.bmp
```

The result is a corrupted or mismatched `dashboard.previous.bmp` that breaks change detection, and potentially a partially-written `dashboard.bmp` served to the ESP32.

## Solution

### 1. Add an in-flight lock in `capture.ts`

Replace the exported `generateImage()` with a wrapper that coalesces concurrent calls into the same in-flight Promise:

```typescript
let inFlightGeneration: Promise<{ bmp: string }> | null = null;

async function generateImage(options: GenerateImageOptions = {}): Promise<{ bmp: string }> {
    if (inFlightGeneration) {
        console.log('[capture] Generation already in progress, awaiting existing run...');
        return inFlightGeneration;
    }

    inFlightGeneration = _generateImage(options).finally(() => {
        inFlightGeneration = null;
    });

    return inFlightGeneration;
}

// Rename the existing implementation to _generateImage
async function _generateImage(options: GenerateImageOptions = {}): Promise<{ bmp: string }> {
    // ... existing body unchanged ...
}
```

Coalescing (returning the same Promise) is preferable to queuing because a second refresh triggered while a generation is running will see the freshest possible output from the current run — no need to start another.

### 2. Expose `isGenerating()` for the health endpoint

```typescript
export function isGenerating(): boolean {
    return inFlightGeneration !== null;
}
```

This lets a future `/health` endpoint (see `03-health-checks.md`) report whether a generation is currently in progress.

## Files to Change

| File | Change |
|------|--------|
| `capture.ts` | Rename internal function to `_generateImage`; add `inFlightGeneration` lock in exported `generateImage`; export `isGenerating()` |
| `tests/capture.test.js` | Add test: two concurrent `generateImage()` calls return the same Promise instance |

## Verification

- Calling `generateImage()` twice without awaiting the first returns the same Promise (strict equality `===`).
- After the first generation completes, a second call starts a new Playwright launch (lock is cleared).
- `pnpm test` passes with no regressions.
- Manual test: `curl -X POST http://localhost:3001/api/refresh & curl -X POST http://localhost:3001/api/refresh` — only one Playwright process appears in `ps` output.
