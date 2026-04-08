# High Impact: Self-Contained Standalone Capture Mode

**Priority:** High
**Impact Areas:** Reliability, developer experience, deployment consistency

## Problem

`capture.ts` currently infers its capture target from `CAPTURE_URL` or `process.env.PORT`, and falls back to port `5173`:

```typescript
const PORT = process.env.PORT || 5173;
const BASE_URL = process.env.CAPTURE_URL || `http://localhost:${PORT}`;
```

That behavior is brittle because the rest of the project does not share the same default:

- `server.ts` listens on port `3000` by default.
- `README.md` and `AGENTS.md` describe different example and default capture URLs.
- `pnpm run generate` does not start a preview server, so it depends on some other process already serving the dashboard.

In practice, standalone capture can fail with `ECONNREFUSED`, point at the wrong server, or accidentally capture a stale dev preview. That makes the main output path less deterministic than it should be for a device-oriented image generator.

## Solution

### 1. Centralize capture target resolution

Move the logic into a helper that makes the precedence explicit and removes the silent `5173` fallback.

```typescript
interface CaptureTarget {
    url: string;
    teardown?: () => Promise<void>;
}

async function resolveCaptureTarget(): Promise<CaptureTarget> {
    if (process.env.CAPTURE_URL) {
        return { url: process.env.CAPTURE_URL };
    }

    return createLocalPreviewServer();
}
```

If no explicit URL is configured, `generate` should create its own preview instead of guessing.

### 2. Add a local preview server for standalone generation

Start a lightweight Express server on an ephemeral port that serves the dashboard assets and `/api/data` for the duration of the capture run.

```typescript
async function createLocalPreviewServer(): Promise<CaptureTarget> {
    const previewApp = express();
    previewApp.use(express.static(path.join(APP_ROOT, 'dashboard-web')));
    previewApp.get('/api/data', async (_req, res) => {
        res.json(await fetchAllData());
    });

    const server = await new Promise<import('http').Server>(resolve => {
        const instance = previewApp.listen(0, () => resolve(instance));
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    return {
        url: `http://127.0.0.1:${port}/`,
        teardown: () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    };
}
```

This makes `pnpm run generate` self-sufficient and keeps the capture pipeline independent of a separately managed dev server.

### 3. Align scripts and docs around the same capture modes

Document two explicit modes instead of a hidden fallback:

1. `CAPTURE_URL` set: capture an already running dashboard
2. `CAPTURE_URL` unset: start an internal preview server automatically

```json
{
  "scripts": {
    "generate": "ts-node --transpile-only capture.ts"
  }
}
```

The script itself can stay the same once `capture.ts` owns the full lifecycle.

### 4. Add tests for target resolution precedence

Codify the behavior so future refactors do not reintroduce ambiguous defaults.

```typescript
test('resolveCaptureTarget prefers CAPTURE_URL over local preview', async () => {
    process.env.CAPTURE_URL = 'http://example.test/';
    const target = await resolveCaptureTarget();
    expect(target.url).toBe('http://example.test/');
});
```

## Files to Change

| File | Change |
| ---- | ------ |
| `capture.ts` | Replace implicit localhost fallback with `resolveCaptureTarget()` and preview-server lifecycle management |
| `src/services/preview-server.ts` | New helper that starts and stops an ephemeral local preview server for capture runs |
| `src/services/data.ts` | Reuse existing aggregation logic from the preview server's `/api/data` route |
| `README.md` | Document explicit standalone vs external capture modes |
| `AGENTS.md` | Update architecture notes to match the new capture-target behavior |
| `tests/capture.test.js` | Add tests for capture target precedence and preview-server teardown |

## Verification

- Running `pnpm run generate` with no `CAPTURE_URL` succeeds without requiring a separate Vite or Express process.
- Setting `CAPTURE_URL` still captures the explicitly configured target and skips the internal preview server.
- `capture.ts` no longer relies on an undocumented default port that differs from `server.ts`.
- The preview server is always torn down after capture, including when screenshot generation fails.
